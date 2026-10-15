import { z } from 'zod';
import { NextResponse } from 'next/server';
import { fail, guard, limit, body } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { writeAudit } from '@/lib/audit';
import { conflict, notFound, validationError } from '@/lib/errors';
import { loadGradeScale } from '@/server/services/exams';

/**
 * Grading scales.
 *
 * Bands must not overlap and must leave no gap, because a percentage that
 * matches no band would otherwise produce a silent blank grade.
 */
export async function GET() {
  try {
    await guard(PERMISSIONS.EXAM_VIEW);

    const [scales, resolved] = await Promise.all([
      prisma.gradeScale.findMany({
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          isDefault: true,
          bands: {
            orderBy: { minPercent: 'desc' },
            select: {
              id: true,
              grade: true,
              minPercent: true,
              maxPercent: true,
              gpa: true,
              remark: true,
            },
          },
          _count: { select: { examSubjects: true, examResults: true } },
        },
      }),
      loadGradeScale(null),
    ]);

    return NextResponse.json({ data: { scales, active: resolved } });
  } catch (error) {
    return fail(error, 'grading GET');
  }
}

const bandSchema = z.object({
  grade: z.string().trim().min(1).max(4),
  minPercent: z.coerce.number().min(0).max(100),
  maxPercent: z.coerce.number().min(0).max(100),
  gpa: z.coerce.number().min(0).max(10).optional().nullable(),
  remark: z.string().trim().max(120).optional().nullable(),
});

/** Reject overlapping or out-of-range bands before anything is written. */
function assertBandsValid(bands: Array<z.infer<typeof bandSchema>>) {
  for (const band of bands) {
    if (band.maxPercent < band.minPercent) {
      throw validationError(
        `Grade ${band.grade}: the maximum percentage cannot be below the minimum.`,
      );
    }
  }

  const sorted = [...bands].sort((a, b) => b.minPercent - a.minPercent);

  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].maxPercent >= sorted[i - 1].minPercent) {
      throw validationError(
        `Grades ${sorted[i].grade} and ${sorted[i - 1].grade} overlap. Adjust the boundaries so no percentage matches two grades.`,
      );
    }
  }
}

export async function POST(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.GRADING_MANAGE);
    await limit(request, 'grading:write', 30, 60);

    const payload = await body(
      request,
      z.object({
        name: z.string().trim().min(2).max(60),
        isDefault: z.boolean().default(false),
        bands: z.array(bandSchema).min(1, 'Add at least one grade band.').max(20),
      }),
    );

    assertBandsValid(payload.bands);

    const duplicate = await prisma.gradeScale.findUnique({
      where: { name: payload.name },
      select: { id: true },
    });
    if (duplicate) throw conflict(`A grading scale named "${payload.name}" already exists.`);

    const scale = await prisma.$transaction(async (tx) => {
      if (payload.isDefault) {
        await tx.gradeScale.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      }

      return tx.gradeScale.create({
        data: {
          name: payload.name,
          isDefault: payload.isDefault,
          bands: {
            create: payload.bands.map((band) => ({
              grade: band.grade.toUpperCase(),
              minPercent: band.minPercent,
              maxPercent: band.maxPercent,
              gpa: band.gpa ?? null,
              remark: band.remark ?? null,
            })),
          },
        },
        select: { id: true, name: true, isDefault: true },
      });
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'grading_scale.create',
      entity: 'GradeScale',
      entityId: scale.id,
      after: { name: scale.name, bands: payload.bands.length, isDefault: scale.isDefault },
    });

    return NextResponse.json({ data: scale }, { status: 201 });
  } catch (error) {
    return fail(error, 'grading POST');
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.GRADING_MANAGE);
    await limit(request, 'grading:update', 40, 60);

    const payload = await body(
      request,
      z.discriminatedUnion('action', [
        z.object({
          action: z.literal('replaceBands'),
          gradeScaleId: z.string().min(1),
          bands: z.array(bandSchema).min(1).max(20),
        }),
        z.object({
          action: z.literal('setDefault'),
          gradeScaleId: z.string().min(1),
        }),
        z.object({
          action: z.literal('rename'),
          gradeScaleId: z.string().min(1),
          name: z.string().trim().min(2).max(60),
        }),
      ]),
    );

    if (payload.action === 'replaceBands') {
      assertBandsValid(payload.bands);

      const scale = await prisma.gradeScale.findUnique({
        where: { id: payload.gradeScaleId },
        select: { id: true, name: true },
      });
      if (!scale) throw notFound('Grading scale not found.');

      await prisma.$transaction(async (tx) => {
        await tx.gradeBand.deleteMany({ where: { gradeScaleId: payload.gradeScaleId } });
        await tx.gradeBand.createMany({
          data: payload.bands.map((band) => ({
            gradeScaleId: payload.gradeScaleId,
            grade: band.grade.toUpperCase(),
            minPercent: band.minPercent,
            maxPercent: band.maxPercent,
            gpa: band.gpa ?? null,
            remark: band.remark ?? null,
          })),
        });
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'grading_scale.replace_bands',
        entity: 'GradeScale',
        entityId: payload.gradeScaleId,
        after: { bands: payload.bands.length },
      });

      return NextResponse.json({ data: { gradeScaleId: payload.gradeScaleId } });
    }

    if (payload.action === 'setDefault') {
      const scale = await prisma.gradeScale.findUnique({
        where: { id: payload.gradeScaleId },
        select: { id: true, name: true },
      });
      if (!scale) throw notFound('Grading scale not found.');

      await prisma.$transaction([
        prisma.gradeScale.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
        prisma.gradeScale.update({
          where: { id: payload.gradeScaleId },
          data: { isDefault: true },
        }),
      ]);

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'grading_scale.set_default',
        entity: 'GradeScale',
        entityId: payload.gradeScaleId,
        after: { name: scale.name },
      });

      return NextResponse.json({ data: { gradeScaleId: payload.gradeScaleId, isDefault: true } });
    }

    const updated = await prisma.gradeScale.update({
      where: { id: payload.gradeScaleId },
      data: { name: payload.name },
      select: { id: true, name: true },
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'grading_scale.rename',
      entity: 'GradeScale',
      entityId: updated.id,
      after: { name: updated.name },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return fail(error, 'grading PUT');
  }
}
