import { z } from 'zod';
import { NextResponse } from 'next/server';
import { fail, guard, limit, body, parseListQuery, listResponse } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { writeAudit } from '@/lib/audit';
import { conflict, notFound } from '@/lib/errors';
import { money } from '@/lib/validation';
import { Prisma } from '@prisma/client';

const courseSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Give the course a short code.')
    .max(20)
    .regex(/^[A-Z0-9-]+$/i, 'Use letters, numbers and hyphens only.'),
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  durationWeeks: z.coerce.number().int().min(1).max(520).optional().nullable(),
  baseFee: money.default(0),
  feeFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'TERM', 'ANNUAL', 'ONE_TIME']).default('MONTHLY'),
  prerequisites: z.string().trim().max(500).optional().nullable(),
  certificateEligible: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

/** Courses and programmes. */
export async function GET(request: Request) {
  try {
    await guard(PERMISSIONS.COURSE_VIEW);
    const query = parseListQuery(request);
    const includeInactive = query.params.get('includeInactive') === 'true';

    const where: Prisma.CourseWhereInput = {
      ...(includeInactive ? {} : { isActive: true }),
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
      prisma.course.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: query.skip,
        take: query.take,
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          durationWeeks: true,
          baseFee: true,
          feeFrequency: true,
          prerequisites: true,
          certificateEligible: true,
          isActive: true,
          _count: { select: { classSections: true, courseSubjects: true, feeStructures: true } },
        },
      }),
      prisma.course.count({ where }),
    ]);

    return listResponse(rows, total, query);
  } catch (error) {
    return fail(error, 'courses GET');
  }
}

export async function POST(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.COURSE_MANAGE);
    await limit(request, 'courses:write', 40, 60);

    const payload = await body(request, courseSchema);

    const existing = await prisma.course.findUnique({
      where: { code: payload.code.toUpperCase() },
      select: { id: true },
    });

    if (existing) throw conflict(`A course with the code ${payload.code.toUpperCase()} already exists.`);

    const course = await prisma.course.create({
      data: { ...payload, code: payload.code.toUpperCase() },
      select: { id: true, code: true, name: true },
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'course.create',
      entity: 'Course',
      entityId: course.id,
      after: { code: course.code, name: course.name },
    });

    return NextResponse.json({ data: course }, { status: 201 });
  } catch (error) {
    return fail(error, 'courses POST');
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.COURSE_MANAGE);
    await limit(request, 'courses:update', 60, 60);

    const payload = await body(request, courseSchema.partial().extend({ id: z.string().min(1) }));

    const before = await prisma.course.findUnique({ where: { id: payload.id } });
    if (!before) throw notFound('Course not found.');

    const { id, code, ...rest } = payload;

    const updated = await prisma.course.update({
      where: { id },
      data: {
        ...rest,
        ...(code ? { code: code.toUpperCase() } : {}),
      },
      select: { id: true, code: true, name: true, isActive: true },
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'course.update',
      entity: 'Course',
      entityId: id,
      before: { code: before.code, name: before.name, isActive: before.isActive },
      after: { code: updated.code, name: updated.name, isActive: updated.isActive },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return fail(error, 'courses PUT');
  }
}
