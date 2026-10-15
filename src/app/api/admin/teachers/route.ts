import { z } from 'zod';
import { NextResponse } from 'next/server';
import { fail, guard, limit, body, parseListQuery, listResponse } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { writeAudit } from '@/lib/audit';
import { conflict, notFound } from '@/lib/errors';
import { teacherWorkload } from '@/server/services/timetable';
import { Role, UserStatus, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

const teacherSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().max(30).optional().nullable(),
  employeeCode: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[A-Z0-9-]+$/i, 'Use letters, numbers and hyphens only.'),
  designation: z.string().trim().max(80).optional().nullable(),
  department: z.string().trim().max(80).optional().nullable(),
  qualification: z.string().trim().max(160).optional().nullable(),
  specialization: z.string().trim().max(160).optional().nullable(),
  joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'VISITING']).default('FULL_TIME'),
  maxWeeklyPeriods: z.coerce.number().int().min(1).max(60).default(24),
  subjectIds: z.array(z.string().min(1)).max(20).default([]),
  initialPassword: z.string().min(8).max(128).optional().nullable(),
});

/** Teacher and staff directory. */
export async function GET(request: Request) {
  try {
    await guard(PERMISSIONS.TEACHER_VIEW);
    const query = parseListQuery(request);
    const scope = query.params.get('scope') ?? 'list';

    if (scope === 'workload') {
      return NextResponse.json({ data: await teacherWorkload() });
    }

    if (scope === 'profile') {
      const id = query.params.get('id');
      if (!id) {
        return NextResponse.json(
          { error: { code: 'VALIDATION', message: 'A teacher is required.' } },
          { status: 422 },
        );
      }

      const teacher = await prisma.teacherProfile.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true, status: true } },
          teacherSubjects: {
            select: {
              id: true,
              classSectionId: true,
              subject: { select: { id: true, name: true, code: true } },
            },
          },
          classTeacherOf: {
            select: { id: true, name: true, course: { select: { name: true } } },
          },
          leaveRequests: {
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true,
              startDate: true,
              endDate: true,
              leaveType: true,
              reason: true,
              status: true,
              createdAt: true,
            },
          },
          _count: { select: { timetableSlots: true, assignments: true } },
        },
      });

      if (!teacher) throw notFound('Teacher not found.');

      return NextResponse.json({ data: teacher });
    }

    const includeInactive = query.params.get('includeInactive') === 'true';

    const where: Prisma.TeacherProfileWhereInput = {
      ...(includeInactive ? {} : { isActive: true }),
      ...(query.search
        ? {
            OR: [
              { employeeCode: { contains: query.search, mode: 'insensitive' } },
              { user: { name: { contains: query.search, mode: 'insensitive' } } },
              { user: { email: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.teacherProfile.findMany({
        where,
        orderBy: { user: { name: 'asc' } },
        skip: query.skip,
        take: query.take,
        select: {
          id: true,
          employeeCode: true,
          designation: true,
          department: true,
          qualification: true,
          employmentType: true,
          maxWeeklyPeriods: true,
          joiningDate: true,
          isActive: true,
          user: { select: { id: true, name: true, email: true, phone: true, status: true } },
          teacherSubjects: {
            select: { subject: { select: { id: true, name: true, code: true } } },
          },
          _count: { select: { timetableSlots: true, classTeacherOf: true, assignments: true } },
        },
      }),
      prisma.teacherProfile.count({ where }),
    ]);

    return listResponse(rows, total, query);
  } catch (error) {
    return fail(error, 'teachers GET');
  }
}

/** Create a teacher with a portal login. */
export async function POST(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.TEACHER_UPDATE);
    await limit(request, 'teachers:write', 30, 60);

    const payload = await body(request, teacherSchema);
    const email = payload.email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw conflict(`An account already exists for ${email}.`);

    const duplicateCode = await prisma.teacherProfile.findUnique({
      where: { employeeCode: payload.employeeCode.toUpperCase() },
      select: { id: true },
    });
    if (duplicateCode) {
      throw conflict(`Employee code ${payload.employeeCode.toUpperCase()} is already in use.`);
    }

    if (payload.subjectIds.length > 0) {
      const found = await prisma.subject.count({ where: { id: { in: payload.subjectIds } } });
      if (found !== payload.subjectIds.length) {
        throw conflict('One or more selected subjects do not exist.');
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name: payload.name,
          phone: payload.phone ?? null,
          role: Role.TEACHER,
          status: UserStatus.ACTIVE,
          passwordHash: await bcrypt.hash(
            payload.initialPassword ?? `Tch-${Math.random().toString(36).slice(2, 10)}`,
            12,
          ),
        },
        select: { id: true },
      });

      const profile = await tx.teacherProfile.create({
        data: {
          userId: user.id,
          employeeCode: payload.employeeCode.toUpperCase(),
          designation: payload.designation ?? null,
          department: payload.department ?? null,
          qualification: payload.qualification ?? null,
          specialization: payload.specialization ?? null,
          employmentType: payload.employmentType,
          maxWeeklyPeriods: payload.maxWeeklyPeriods,
          ...(payload.joiningDate
            ? { joiningDate: new Date(`${payload.joiningDate}T00:00:00.000Z`) }
            : {}),
        },
        select: { id: true, employeeCode: true },
      });

      if (payload.subjectIds.length > 0) {
        await tx.teacherSubject.createMany({
          data: payload.subjectIds.map((subjectId) => ({
            teacherProfileId: profile.id,
            subjectId,
          })),
          skipDuplicates: true,
        });
      }

      return { userId: user.id, ...profile };
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'teacher.create',
      entity: 'TeacherProfile',
      entityId: result.id,
      after: {
        employeeCode: result.employeeCode,
        email,
        subjects: payload.subjectIds.length,
      },
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return fail(error, 'teachers POST');
  }
}

/** Update a teacher, or replace their subject assignments. */
export async function PUT(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.TEACHER_UPDATE);
    await limit(request, 'teachers:update', 60, 60);

    const payload = await body(
      request,
      z.discriminatedUnion('action', [
        z.object({
          action: z.literal('update'),
          id: z.string().min(1),
          values: z
            .object({
              name: z.string().trim().min(2).max(120).optional(),
              phone: z.string().trim().max(30).optional().nullable(),
              designation: z.string().trim().max(80).optional().nullable(),
              department: z.string().trim().max(80).optional().nullable(),
              qualification: z.string().trim().max(160).optional().nullable(),
              specialization: z.string().trim().max(160).optional().nullable(),
              employmentType: z
                .enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'VISITING'])
                .optional(),
              maxWeeklyPeriods: z.coerce.number().int().min(1).max(60).optional(),
              isActive: z.boolean().optional(),
            })
            .strict(),
        }),
        z.object({
          action: z.literal('assignSubjects'),
          teacherProfileId: z.string().min(1),
          subjectIds: z.array(z.string().min(1)).max(20),
        }),
        z.object({
          action: z.literal('resetPassword'),
          teacherProfileId: z.string().min(1),
          newPassword: z.string().min(8).max(128),
        }),
      ]),
    );

    if (payload.action === 'update') {
      const profile = await prisma.teacherProfile.findUnique({
        where: { id: payload.id },
        select: { id: true, userId: true, isActive: true },
      });

      if (!profile) throw notFound('Teacher not found.');

      const { name, phone, ...profileValues } = payload.values;

      const updated = await prisma.$transaction(async (tx) => {
        if (name !== undefined || phone !== undefined) {
          await tx.user.update({
            where: { id: profile.userId },
            data: {
              ...(name !== undefined ? { name } : {}),
              ...(phone !== undefined ? { phone } : {}),
              // Suspending a teacher must also revoke their ability to sign in.
              ...(profileValues.isActive === false ? { status: UserStatus.SUSPENDED } : {}),
              ...(profileValues.isActive === true ? { status: UserStatus.ACTIVE } : {}),
            },
          });
        }

        return tx.teacherProfile.update({
          where: { id: payload.id },
          data: profileValues,
          select: { id: true, employeeCode: true, isActive: true },
        });
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'teacher.update',
        entity: 'TeacherProfile',
        entityId: payload.id,
        after: payload.values,
      });

      return NextResponse.json({ data: updated });
    }

    if (payload.action === 'assignSubjects') {
      const found = await prisma.subject.count({
        where: { id: { in: payload.subjectIds } },
      });

      if (found !== payload.subjectIds.length) {
        throw conflict('One or more selected subjects do not exist.');
      }

      await prisma.$transaction(async (tx) => {
        await tx.teacherSubject.deleteMany({
          where: { teacherProfileId: payload.teacherProfileId },
        });

        if (payload.subjectIds.length > 0) {
          await tx.teacherSubject.createMany({
            data: payload.subjectIds.map((subjectId) => ({
              teacherProfileId: payload.teacherProfileId,
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
        action: 'teacher.assign_subjects',
        entity: 'TeacherProfile',
        entityId: payload.teacherProfileId,
        after: { subjectIds: payload.subjectIds },
      });

      return NextResponse.json({ data: { subjects: payload.subjectIds.length } });
    }

    const profile = await prisma.teacherProfile.findUnique({
      where: { id: payload.teacherProfileId },
      select: { userId: true },
    });

    if (!profile) throw notFound('Teacher not found.');

    await prisma.$transaction([
      prisma.user.update({
        where: { id: profile.userId },
        data: { passwordHash: await bcrypt.hash(payload.newPassword, 12) },
      }),
      // Any existing session must not survive a password change.
      prisma.session.deleteMany({ where: { userId: profile.userId } }),
    ]);

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'teacher.reset_password',
      entity: 'TeacherProfile',
      entityId: payload.teacherProfileId,
    });

    return NextResponse.json({ data: { reset: true } });
  } catch (error) {
    return fail(error, 'teachers PUT');
  }
}
