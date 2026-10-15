import { z } from 'zod';
import { NextResponse } from 'next/server';
import { fail, guard, limit, body, parseListQuery, listResponse } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { writeAudit } from '@/lib/audit';
import { conflict, notFound } from '@/lib/errors';
import { Prisma } from '@prisma/client';

const subjectSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[A-Z0-9-]+$/i, 'Use letters, numbers and hyphens only.'),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  credits: z.coerce.number().int().min(0).max(20).default(0),
  isActive: z.boolean().default(true),
});

export async function GET(request: Request) {
  try {
    await guard(PERMISSIONS.SUBJECT_VIEW);
    const query = parseListQuery(request);
    const includeInactive = query.params.get('includeInactive') === 'true';
    const courseId = query.params.get('courseId');

    const where: Prisma.SubjectWhereInput = {
      ...(includeInactive ? {} : { isActive: true }),
      ...(courseId ? { courseSubjects: { some: { courseId } } } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.subject.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: query.skip,
        take: query.take,
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          credits: true,
          isActive: true,
          courseSubjects: { select: { courseId: true, isOptional: true } },
          _count: {
            select: { teacherSubjects: true, classSubjects: true, courseSubjects: true, assignments: true },
          },
        },
      }),
      prisma.subject.count({ where }),
    ]);

    return listResponse(rows, total, query);
  } catch (error) {
    return fail(error, 'subjects GET');
  }
}

export async function POST(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.SUBJECT_MANAGE);
    await limit(request, 'subjects:write', 40, 60);

    const payload = await body(request, subjectSchema);
    const code = payload.code.toUpperCase();

    const existing = await prisma.subject.findUnique({ where: { code }, select: { id: true } });
    if (existing) throw conflict(`A subject with the code ${code} already exists.`);

    const subject = await prisma.subject.create({
      data: { ...payload, code },
      select: { id: true, code: true, name: true },
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'subject.create',
      entity: 'Subject',
      entityId: subject.id,
      after: { code, name: subject.name },
    });

    return NextResponse.json({ data: subject }, { status: 201 });
  } catch (error) {
    return fail(error, 'subjects POST');
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.SUBJECT_MANAGE);
    await limit(request, 'subjects:update', 60, 60);

    const payload = await body(
      request,
      z.discriminatedUnion('action', [
        z.object({
          action: z.literal('update'),
          id: z.string().min(1),
          values: subjectSchema.partial().omit({ code: true }),
        }),
        z.object({
          action: z.literal('linkCourse'),
          subjectId: z.string().min(1),
          courseId: z.string().min(1),
          isOptional: z.boolean().default(false),
        }),
        z.object({
          action: z.literal('unlinkCourse'),
          subjectId: z.string().min(1),
          courseId: z.string().min(1),
        }),
      ]),
    );

    if (payload.action === 'update') {
      const before = await prisma.subject.findUnique({ where: { id: payload.id } });
      if (!before) throw notFound('Subject not found.');

      const updated = await prisma.subject.update({
        where: { id: payload.id },
        data: payload.values,
        select: { id: true, code: true, name: true, isActive: true },
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'subject.update',
        entity: 'Subject',
        entityId: payload.id,
        before: { name: before.name, credits: before.credits, isActive: before.isActive },
        after: payload.values,
      });

      return NextResponse.json({ data: updated });
    }

    if (payload.action === 'linkCourse') {
      const link = await prisma.courseSubject.upsert({
        where: {
          courseId_subjectId: { courseId: payload.courseId, subjectId: payload.subjectId },
        },
        create: {
          courseId: payload.courseId,
          subjectId: payload.subjectId,
          isOptional: payload.isOptional,
        },
        update: { isOptional: payload.isOptional },
        select: { id: true },
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'subject.link_course',
        entity: 'CourseSubject',
        entityId: link.id,
        after: { courseId: payload.courseId, subjectId: payload.subjectId },
      });

      return NextResponse.json({ data: link });
    }

    const removed = await prisma.courseSubject.deleteMany({
      where: { courseId: payload.courseId, subjectId: payload.subjectId },
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'subject.unlink_course',
      entity: 'CourseSubject',
      after: { courseId: payload.courseId, subjectId: payload.subjectId },
    });

    return NextResponse.json({ data: { removed: removed.count } });
  } catch (error) {
    return fail(error, 'subjects PUT');
  }
}
