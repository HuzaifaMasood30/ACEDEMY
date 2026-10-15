import { z } from 'zod';
import { NextResponse } from 'next/server';
import { fail, guard, limit, body, parseListQuery, listResponse } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { writeAudit } from '@/lib/audit';
import { conflict, notFound, validationError } from '@/lib/errors';
import { EnrollmentStatus, Prisma } from '@prisma/client';

const classSchema = z.object({
  name: z.string().trim().min(2).max(80),
  courseId: z.string().min(1),
  academicSessionId: z.string().min(1),
  capacity: z.coerce.number().int().min(1).max(500).default(40),
  classTeacherId: z.string().min(1).optional().nullable(),
  isActive: z.boolean().default(true),
});

/**
 * Classes, sections and batches.
 *
 * A class is a teaching group within a course for one academic session. Its
 * capacity is enforced at enrolment time, not just displayed here.
 */
export async function GET(request: Request) {
  try {
    await guard(PERMISSIONS.CLASS_VIEW);
    const query = parseListQuery(request);
    const scope = query.params.get('scope') ?? 'list';

    if (scope === 'detail') {
      const id = query.params.get('id');
      if (!id) {
        return NextResponse.json(
          { error: { code: 'VALIDATION', message: 'A class is required.' } },
          { status: 422 },
        );
      }

      const classSection = await prisma.classSection.findUnique({
        where: { id },
        include: {
          course: { select: { id: true, name: true, code: true } },
          academicSession: { select: { id: true, name: true } },
          classTeacher: { select: { id: true, user: { select: { name: true } } } },
          classSubjects: {
            select: {
              id: true,
              subject: { select: { id: true, name: true, code: true } },
            },
          },
          batches: {
            where: { isActive: true },
            select: { id: true, name: true, capacity: true },
          },
          enrollments: {
            where: { status: EnrollmentStatus.ACTIVE },
            select: {
              id: true,
              rollNo: true,
              enrolledAt: true,
              student: {
                select: {
                  id: true,
                  admissionNo: true,
                  firstName: true,
                  lastName: true,
                  photoUrl: true,
                  status: true,
                },
              },
            },
            orderBy: { student: { firstName: 'asc' } },
          },
        },
      });

      if (!classSection) throw notFound('Class not found.');

      return NextResponse.json({ data: classSection });
    }

    const includeInactive = query.params.get('includeInactive') === 'true';
    const courseId = query.params.get('courseId');
    const academicSessionId = query.params.get('academicSessionId');

    const where: Prisma.ClassSectionWhereInput = {
      ...(includeInactive ? {} : { isActive: true }),
      ...(courseId ? { courseId } : {}),
      ...(academicSessionId ? { academicSessionId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { course: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.classSection.findMany({
        where,
        orderBy: [{ course: { name: 'asc' } }, { name: 'asc' }],
        skip: query.skip,
        take: query.take,
        select: {
          id: true,
          name: true,
          capacity: true,
          isActive: true,
          course: { select: { id: true, name: true, code: true } },
          academicSession: { select: { id: true, name: true } },
          classTeacher: { select: { user: { select: { name: true } } } },
          _count: {
            select: {
              enrollments: { where: { status: EnrollmentStatus.ACTIVE } },
              classSubjects: true,
              batches: { where: { isActive: true } },
            },
          },
        },
      }),
      prisma.classSection.count({ where }),
    ]);

    return listResponse(rows, total, query);
  } catch (error) {
    return fail(error, 'classes GET');
  }
}

export async function POST(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.CLASS_MANAGE);
    await limit(request, 'classes:write', 40, 60);

    const payload = await body(request, classSchema);

    const [course, session] = await Promise.all([
      prisma.course.findUnique({ where: { id: payload.courseId }, select: { id: true } }),
      prisma.academicSession.findUnique({
        where: { id: payload.academicSessionId },
        select: { id: true },
      }),
    ]);

    if (!course) throw validationError('Choose a valid course.');
    if (!session) throw validationError('Choose a valid academic session.');

    const duplicate = await prisma.classSection.findFirst({
      where: {
        name: payload.name,
        courseId: payload.courseId,
        academicSessionId: payload.academicSessionId,
      },
      select: { id: true },
    });

    if (duplicate) {
      throw conflict(
        `A class named ${payload.name} already exists for this course in this session.`,
      );
    }

    const created = await prisma.classSection.create({
      data: {
        name: payload.name,
        courseId: payload.courseId,
        academicSessionId: payload.academicSessionId,
        capacity: payload.capacity,
        classTeacherId: payload.classTeacherId ?? null,
        isActive: payload.isActive,
      },
      select: { id: true, name: true },
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'class.create',
      entity: 'ClassSection',
      entityId: created.id,
      after: { name: created.name, courseId: payload.courseId, capacity: payload.capacity ?? null },
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    return fail(error, 'classes POST');
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.CLASS_MANAGE);
    await limit(request, 'classes:update', 60, 60);

    const payload = await body(
      request,
      z.discriminatedUnion('action', [
        z.object({
          action: z.literal('update'),
          id: z.string().min(1),
          values: z
            .object({
              name: z.string().trim().min(2).max(80).optional(),
              capacity: z.coerce.number().int().min(1).max(500).optional(),
              classTeacherId: z.string().min(1).optional().nullable(),
              isActive: z.boolean().optional(),
            })
            .strict(),
        }),
        z.object({
          action: z.literal('assignSubjects'),
          classSectionId: z.string().min(1),
          subjectIds: z.array(z.string().min(1)).max(40),
        }),
        z.object({
          action: z.literal('createBatch'),
          classSectionId: z.string().min(1),
          name: z.string().trim().min(1).max(60),
          capacity: z.coerce.number().int().min(1).max(500).default(30),
        }),
      ]),
    );

    if (payload.action === 'update') {
      const before = await prisma.classSection.findUnique({ where: { id: payload.id } });
      if (!before) throw notFound('Class not found.');

      // Lowering capacity below the current roll would strand students.
      if (payload.values.capacity !== undefined) {
        const enrolled = await prisma.enrollment.count({
          where: { classSectionId: payload.id, status: EnrollmentStatus.ACTIVE },
        });

        if (payload.values.capacity < enrolled) {
          throw conflict(
            `Capacity cannot be set below the ${enrolled} students already enrolled.`,
            { enrolled },
          );
        }
      }

      const updated = await prisma.classSection.update({
        where: { id: payload.id },
        data: payload.values,
        select: { id: true, name: true, capacity: true, isActive: true },
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'class.update',
        entity: 'ClassSection',
        entityId: payload.id,
        before: { name: before.name, capacity: before.capacity, isActive: before.isActive },
        after: payload.values,
      });

      return NextResponse.json({ data: updated });
    }

    if (payload.action === 'assignSubjects') {
      const subjects = await prisma.subject.findMany({
        where: { id: { in: payload.subjectIds } },
        select: { id: true },
      });

      if (subjects.length !== payload.subjectIds.length) {
        throw validationError('One or more selected subjects do not exist.');
      }

      await prisma.$transaction(async (tx) => {
        await tx.classSubject.deleteMany({ where: { classSectionId: payload.classSectionId } });

        if (payload.subjectIds.length > 0) {
          await tx.classSubject.createMany({
            data: payload.subjectIds.map((subjectId) => ({
              classSectionId: payload.classSectionId,
              subjectId,
            })),
            skipDuplicates: true,
          });
        }
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'class.assign_subjects',
        entity: 'ClassSection',
        entityId: payload.classSectionId,
        after: { subjectIds: payload.subjectIds },
      });

      return NextResponse.json({ data: { subjects: payload.subjectIds.length } });
    }

    const batch = await prisma.batch.create({
      data: {
        classSectionId: payload.classSectionId,
        name: payload.name,
        capacity: payload.capacity,
      },
      select: { id: true, name: true },
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'batch.create',
      entity: 'Batch',
      entityId: batch.id,
      after: { classSectionId: payload.classSectionId, name: batch.name },
    });

    return NextResponse.json({ data: batch }, { status: 201 });
  } catch (error) {
    return fail(error, 'classes PUT');
  }
}
