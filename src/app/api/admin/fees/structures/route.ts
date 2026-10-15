import { z } from 'zod';
import { NextResponse } from 'next/server';
import { fail, guard, limit, body } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { writeAudit } from '@/lib/audit';
import { notFound } from '@/lib/errors';
import { FeeFrequency } from '@prisma/client';

/**
 * Fee structures describe what a class or course charges. They are templates:
 * editing one never rewrites invoices already issued from it, because every
 * invoice stores its own copy of the line items.
 */

const itemSchema = z.object({
  head: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200).optional().nullable(),
  amount: z.coerce.number().min(0).max(10_000_000),
  isOptional: z.boolean().default(false),
  frequency: z.nativeEnum(FeeFrequency),
  dueDayOfMonth: z.coerce.number().int().min(1).max(31).optional().nullable(),
});

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  courseId: z.string().min(1).optional().nullable(),
  classSectionId: z.string().min(1).optional().nullable(),
  academicSessionId: z.string().min(1).optional().nullable(),
  frequency: z.nativeEnum(FeeFrequency),
  items: z.array(itemSchema).min(1, 'Add at least one charge.'),
});

const updateSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('update'),
    structureId: z.string().min(1),
    name: z.string().trim().min(2).max(120).optional(),
    frequency: z.nativeEnum(FeeFrequency).optional(),
    isActive: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('replaceItems'),
    structureId: z.string().min(1),
    items: z.array(itemSchema).min(1),
  }),
  z.object({
    action: z.literal('delete'),
    structureId: z.string().min(1),
  }),
]);

const itemSelect = {
  id: true,
  head: true,
  description: true,
  amount: true,
  isOptional: true,
  frequency: true,
  dueDayOfMonth: true,
} as const;

function summarise(items: Array<{ amount: unknown; isOptional: boolean }>) {
  const total = items.reduce((sum, item) => sum + Number(item.amount), 0);
  const recurring = items
    .filter((item) => !item.isOptional)
    .reduce((sum, item) => sum + Number(item.amount), 0);
  return { total, recurring };
}

export async function GET(request: Request) {
  try {
    await guard(PERMISSIONS.FEE_STRUCTURE_VIEW);
    const url = new URL(request.url);

    const structureId = url.searchParams.get('structureId');
    if (structureId) {
      const structure = await prisma.feeStructure.findUnique({
        where: { id: structureId },
        select: {
          id: true,
          name: true,
          frequency: true,
          isActive: true,
          createdAt: true,
          classSectionId: true,
          course: { select: { id: true, name: true } },
          academicSession: { select: { id: true, name: true } },
          items: { orderBy: { head: 'asc' }, select: itemSelect },
        },
      });
      if (!structure) throw notFound('Fee structure not found.');

      // Informational: how many invoices exist for the class this applies to.
      const invoicesIssued = structure.classSectionId
        ? await prisma.invoice.count({ where: { classSectionId: structure.classSectionId } })
        : 0;

      return NextResponse.json({
        data: { ...structure, invoicesIssued, ...summarise(structure.items) },
      });
    }

    const [structures, courses, classes, sessions] = await Promise.all([
      prisma.feeStructure.findMany({
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          frequency: true,
          isActive: true,
          classSectionId: true,
          courseId: true,
          academicSessionId: true,
          course: { select: { id: true, name: true } },
          academicSession: { select: { id: true, name: true } },
          items: { select: itemSelect },
        },
      }),
      prisma.course.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      prisma.classSection.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      prisma.academicSession.findMany({
        orderBy: { startDate: 'desc' },
        select: { id: true, name: true, isCurrent: true },
      }),
    ]);

    const classNames = new Map(classes.map((c) => [c.id, c.name]));

    return NextResponse.json({
      data: {
        structures: structures.map((structure) => ({
          ...structure,
          className: structure.classSectionId
            ? (classNames.get(structure.classSectionId) ?? null)
            : null,
          ...summarise(structure.items),
        })),
        options: { courses, classes, sessions },
      },
    });
  } catch (error) {
    return fail(error, 'fee structures GET');
  }
}

export async function POST(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.FEE_STRUCTURE_MANAGE);
    await limit(request, 'fee:structures', 30, 60);

    const payload = await body(request, createSchema);

    if (payload.courseId && payload.classSectionId) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message: 'A structure applies to a course or a class, not both.',
          },
        },
        { status: 422 },
      );
    }

    const structure = await prisma.$transaction(async (tx) => {
      const created = await tx.feeStructure.create({
        data: {
          name: payload.name,
          courseId: payload.courseId ?? null,
          classSectionId: payload.classSectionId ?? null,
          academicSessionId: payload.academicSessionId ?? null,
          frequency: payload.frequency,
        },
        select: { id: true, name: true },
      });

      await tx.feeStructureItem.createMany({
        data: payload.items.map((item) => ({
          feeStructureId: created.id,
          head: item.head,
          description: item.description ?? null,
          amount: item.amount,
          isOptional: item.isOptional,
          frequency: item.frequency,
          dueDayOfMonth: item.dueDayOfMonth ?? null,
        })),
      });

      return created;
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'fee_structure.create',
      entity: 'FeeStructure',
      entityId: structure.id,
      after: { name: structure.name, frequency: payload.frequency, items: payload.items.length },
    });

    return NextResponse.json({ data: structure }, { status: 201 });
  } catch (error) {
    return fail(error, 'fee structures POST');
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.FEE_STRUCTURE_MANAGE);
    await limit(request, 'fee:structures:update', 60, 60);

    const payload = await body(request, updateSchema);

    const existing = await prisma.feeStructure.findUnique({
      where: { id: payload.structureId },
      select: { id: true, name: true, isActive: true, frequency: true },
    });
    if (!existing) throw notFound('Fee structure not found.');

    if (payload.action === 'delete') {
      const classSectionId = await prisma.feeStructure.findUnique({
        where: { id: payload.structureId },
        select: { classSectionId: true },
      });

      const invoices = classSectionId?.classSectionId
        ? await prisma.invoice.count({ where: { classSectionId: classSectionId.classSectionId } })
        : 0;

      if (invoices > 0) {
        return NextResponse.json(
          {
            error: {
              code: 'CONFLICT',
              message:
                'Invoices were issued against this class. Deactivate the structure instead of deleting it so history stays intact.',
            },
          },
          { status: 409 },
        );
      }

      await prisma.feeStructure.delete({ where: { id: payload.structureId } });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'fee_structure.delete',
        entity: 'FeeStructure',
        entityId: existing.id,
        before: { name: existing.name },
      });

      return NextResponse.json({ data: { id: existing.id } });
    }

    if (payload.action === 'replaceItems') {
      await prisma.$transaction(async (tx) => {
        await tx.feeStructureItem.deleteMany({ where: { feeStructureId: payload.structureId } });
        await tx.feeStructureItem.createMany({
          data: payload.items.map((item) => ({
            feeStructureId: payload.structureId,
            head: item.head,
            description: item.description ?? null,
            amount: item.amount,
            isOptional: item.isOptional,
            frequency: item.frequency,
            dueDayOfMonth: item.dueDayOfMonth ?? null,
          })),
        });
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'fee_structure.replace_items',
        entity: 'FeeStructure',
        entityId: existing.id,
        after: { items: payload.items.length },
      });

      return NextResponse.json({ data: { id: existing.id, items: payload.items.length } });
    }

    const updated = await prisma.feeStructure.update({
      where: { id: payload.structureId },
      data: {
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.frequency !== undefined ? { frequency: payload.frequency } : {}),
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
      },
      select: { id: true, name: true, frequency: true, isActive: true },
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'fee_structure.update',
      entity: 'FeeStructure',
      entityId: updated.id,
      before: { name: existing.name, isActive: existing.isActive, frequency: existing.frequency },
      after: updated,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return fail(error, 'fee structures PUT');
  }
}
