import { z } from 'zod';
import { NextResponse } from 'next/server';
import { fail, guard, limit, body, parseListQuery, listResponse } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { writeAudit } from '@/lib/audit';
import {
  admitStudent,
  updateStudent,
  changeStudentStatus,
  transferStudentClass,
  promoteClass,
  bulkImportStudents,
  findPossibleDuplicates,
  listStudents,
} from '@/server/services/students';
import { assertStudentAccess, studentScopeFilter } from '@/server/auth-guard';
import { optionalPhone, phone, email as emailSchema } from '@/lib/validation';
import { EnrollmentStatus, Gender, GuardianRelation, Prisma, Role } from '@prisma/client';

const guardianSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema.optional().nullable(),
  phone: optionalPhone,
  relation: z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER']),
  isPrimary: z.boolean().default(false),
  canViewFees: z.boolean().default(true),
  canViewResults: z.boolean().default(true),
  receivesNotifications: z.boolean().default(true),
  existingUserId: z.string().min(1).optional().nullable(),
});

const admitSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED']).default('UNDISCLOSED'),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  phone: optionalPhone,
  address: z.string().trim().max(400).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  bloodGroup: z.string().trim().max(8).optional().nullable(),
  emergencyContactName: z.string().trim().max(120).optional().nullable(),
  emergencyContactPhone: optionalPhone,
  emergencyContactRelation: z.string().trim().max(40).optional().nullable(),
  previousSchool: z.string().trim().max(160).optional().nullable(),
  previousGrade: z.string().trim().max(60).optional().nullable(),
  admissionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  classSectionId: z.string().min(1),
  academicSessionId: z.string().min(1),
  batchId: z.string().min(1).optional().nullable(),
  rollNo: z.string().trim().max(20).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  guardians: z.array(guardianSchema).min(1, 'Add at least one guardian.'),
  createLogin: z.boolean().default(false),
  initialPassword: z.string().min(8).max(128).optional().nullable(),
  /** Set once the operator has confirmed a duplicate warning. */
  confirmDuplicate: z.boolean().default(false),
});

/**
 * Student directory and profile reads.
 *
 * The list is filtered in the database by the actor's scope, so a teacher only
 * ever receives students they teach and a parent only their own children.
 */
export async function GET(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.STUDENT_VIEW);
    const query = parseListQuery(request);
    const scope = query.params.get('scope') ?? 'list';

    if (scope === 'profile') {
      const studentId = query.params.get('studentId');
      if (!studentId) {
        return NextResponse.json(
          { error: { code: 'VALIDATION', message: 'A student is required.' } },
          { status: 422 },
        );
      }

      await assertStudentAccess(actor, studentId);

      const student = await prisma.student.findUnique({
        where: { id: studentId },
        include: {
          guardians: {
            select: {
              id: true,
              relation: true,
              isPrimary: true,
              isAuthorized: true,
              canViewFees: true,
              canViewResults: true,
              receivesNotifications: true,
              contactPhone: true,
              occupation: true,
              guardianUser: {
                select: { id: true, name: true, email: true, phone: true, status: true },
              },
            },
          },
          enrollments: {
            orderBy: { enrolledAt: 'desc' },
            select: {
              id: true,
              status: true,
              rollNo: true,
              enrolledAt: true,
              leftAt: true,
              classSection: {
                select: {
                  id: true,
                  name: true,
                  course: { select: { id: true, name: true, code: true } },
                },
              },
              batch: { select: { id: true, name: true } },
              academicSession: { select: { id: true, name: true } },
            },
          },
          statusHistory: {
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: {
              id: true,
              fromStatus: true,
              toStatus: true,
              reason: true,
              createdAt: true,
            },
          },
        },
      });

      if (!student) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Student not found.' } },
          { status: 404 },
        );
      }

      return NextResponse.json({ data: student });
    }

    if (scope === 'options') {
      const [classes, sessions, batches] = await Promise.all([
        prisma.classSection.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            capacity: true,
            course: { select: { name: true } },
            _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
          },
        }),
        prisma.academicSession.findMany({
          orderBy: { startDate: 'desc' },
          select: { id: true, name: true, code: true, isCurrent: true },
        }),
        prisma.batch.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, classSectionId: true },
        }),
      ]);

      return NextResponse.json({ data: { classes, sessions, batches } });
    }

    if (scope === 'duplicates') {
      const firstName = query.params.get('firstName') ?? '';
      const lastName = query.params.get('lastName') ?? '';
      const dateOfBirth = query.params.get('dateOfBirth');

      if (!firstName || !lastName) {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION',
              message: 'Provide both a first and last name to check for duplicates.',
            },
          },
          { status: 422 },
        );
      }

      return NextResponse.json({
        data: await findPossibleDuplicates({
          firstName,
          lastName,
          dateOfBirth: dateOfBirth ? new Date(`${dateOfBirth}T00:00:00.000Z`) : null,
        }),
      });
    }

    const scopeFilter = await studentScopeFilter(actor);
    const status = query.params.get('status');
    const classSectionId = query.params.get('classSectionId');
    const academicSessionId = query.params.get('academicSessionId');

    const where: Prisma.StudentWhereInput = {
      ...scopeFilter,
      ...(status ? { status: status as EnrollmentStatus } : {}),
      ...(classSectionId || academicSessionId
        ? {
            enrollments: {
              some: {
                ...(classSectionId ? { classSectionId } : {}),
                ...(academicSessionId ? { academicSessionId } : {}),
                status: EnrollmentStatus.ACTIVE,
              },
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { admissionNo: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
            ],
          }
        : {}),
    };

    const { rows, total } = await listStudents({
      where,
      skip: query.skip,
      take: query.take,
    });

    return listResponse(rows, total, query);
  } catch (error) {
    return fail(error, 'students GET');
  }
}

/** Admit a student, or bulk import a parsed file. */
export async function POST(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.STUDENT_CREATE);
    await limit(request, 'students:create', 60, 60);

    const payload = await body(request, admitSchema);

    if (!payload.confirmDuplicate) {
      const duplicates = await findPossibleDuplicates({
        firstName: payload.firstName,
        lastName: payload.lastName,
        dateOfBirth: payload.dateOfBirth
          ? new Date(`${payload.dateOfBirth}T00:00:00.000Z`)
          : null,
      });

      const strong = duplicates.filter((d) => d.exactMatch);

      if (strong.length > 0) {
        return NextResponse.json(
          {
            error: {
              code: 'CONFLICT',
              message: `A student named ${payload.firstName} ${payload.lastName} with the same date of birth already exists. Confirm to admit anyway.`,
              details: { duplicates: strong },
            },
          },
          { status: 409 },
        );
      }
    }

    const student = await admitStudent({
      firstName: payload.firstName,
      lastName: payload.lastName,
      gender: payload.gender as Gender,
      dateOfBirth: payload.dateOfBirth
        ? new Date(`${payload.dateOfBirth}T00:00:00.000Z`)
        : null,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      address: payload.address ?? null,
      city: payload.city ?? null,
      bloodGroup: payload.bloodGroup ?? null,
      emergencyContactName: payload.emergencyContactName ?? null,
      emergencyContactPhone: payload.emergencyContactPhone ?? null,
      emergencyContactRelation: payload.emergencyContactRelation ?? null,
      previousSchool: payload.previousSchool ?? null,
      previousGrade: payload.previousGrade ?? null,
      admissionDate: payload.admissionDate
        ? new Date(`${payload.admissionDate}T00:00:00.000Z`)
        : undefined,
      classSectionId: payload.classSectionId,
      academicSessionId: payload.academicSessionId,
      batchId: payload.batchId ?? null,
      rollNo: payload.rollNo ?? null,
      notes: payload.notes ?? null,
      guardians: payload.guardians.map((guardian) => ({
        name: guardian.name,
        email: guardian.email ?? null,
        phone: guardian.phone ?? null,
        relation: guardian.relation as GuardianRelation,
        isPrimary: guardian.isPrimary,
        canViewFees: guardian.canViewFees,
        canViewResults: guardian.canViewResults,
        receivesNotifications: guardian.receivesNotifications,
        existingUserId: guardian.existingUserId ?? null,
      })),
      createLogin: payload.createLogin,
      initialPassword: payload.initialPassword ?? null,
      createdByUserId: actor.id,
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'student.admit',
      entity: 'Student',
      entityId: student.id,
      after: {
        admissionNo: student.admissionNo,
        classSectionId: payload.classSectionId,
        guardians: payload.guardians.length,
        loginCreated: payload.createLogin,
      },
    });

    return NextResponse.json({ data: student }, { status: 201 });
  } catch (error) {
    return fail(error, 'students POST');
  }
}

/** Update a student, change status, transfer class or promote a whole class. */
export async function PUT(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.STUDENT_UPDATE);
    await limit(request, 'students:update', 90, 60);

    const payload = await body(
      request,
      z.discriminatedUnion('action', [
        z.object({
          action: z.literal('update'),
          studentId: z.string().min(1),
          values: z
            .object({
              firstName: z.string().trim().min(1).max(60).optional(),
              lastName: z.string().trim().min(1).max(60).optional(),
              gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED']).optional(),
              dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
              email: z.string().trim().email().optional().nullable(),
              phone: optionalPhone,
              address: z.string().trim().max(400).optional().nullable(),
              city: z.string().trim().max(80).optional().nullable(),
              bloodGroup: z.string().trim().max(8).optional().nullable(),
              emergencyContactName: z.string().trim().max(120).optional().nullable(),
              emergencyContactPhone: optionalPhone,
              notes: z.string().trim().max(1000).optional().nullable(),
            })
            .strict(),
        }),
        z.object({
          action: z.literal('status'),
          studentId: z.string().min(1),
          toStatus: z.enum([
            'APPLICANT',
            'ACTIVE',
            'INACTIVE',
            'TRANSFERRED',
            'GRADUATED',
            'WITHDRAWN',
          ]),
          reason: z.string().trim().min(3).max(300),
        }),
        z.object({
          action: z.literal('transfer'),
          studentId: z.string().min(1),
          toClassSectionId: z.string().min(1),
          academicSessionId: z.string().min(1),
          batchId: z.string().min(1).optional().nullable(),
          reason: z.string().trim().min(3).max(300),
        }),
        z.object({
          action: z.literal('promoteClass'),
          fromClassSectionId: z.string().min(1),
          toClassSectionId: z.string().min(1),
          fromAcademicSessionId: z.string().min(1),
          toAcademicSessionId: z.string().min(1),
        }),
      ]),
    );

    if (payload.action === 'update') {
      await assertStudentAccess(actor, payload.studentId);

      const values = payload.values;
      const updated = await updateStudent({
        studentId: payload.studentId,
        actorUserId: actor.id,
        data: {
          ...values,
          ...(values.dateOfBirth !== undefined
            ? {
                dateOfBirth: values.dateOfBirth
                  ? new Date(`${values.dateOfBirth}T00:00:00.000Z`)
                  : null,
              }
            : {}),
        } as Prisma.StudentUpdateInput,
      });

      return NextResponse.json({ data: updated });
    }

    if (payload.action === 'status') {
      const updated = await changeStudentStatus({
        studentId: payload.studentId,
        toStatus: payload.toStatus as EnrollmentStatus,
        reason: payload.reason,
        actorUserId: actor.id,
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'student.status_change',
        entity: 'Student',
        entityId: payload.studentId,
        after: { toStatus: payload.toStatus, reason: payload.reason },
      });

      return NextResponse.json({ data: updated });
    }

    if (payload.action === 'transfer') {
      const enrollment = await transferStudentClass({
        studentId: payload.studentId,
        toClassSectionId: payload.toClassSectionId,
        academicSessionId: payload.academicSessionId,
        batchId: payload.batchId ?? null,
        reason: payload.reason,
        actorUserId: actor.id,
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'student.transfer',
        entity: 'Student',
        entityId: payload.studentId,
        after: {
          toClassSectionId: payload.toClassSectionId,
          reason: payload.reason,
        },
      });

      return NextResponse.json({ data: enrollment });
    }

    const result = await promoteClass({
      fromClassSectionId: payload.fromClassSectionId,
      toClassSectionId: payload.toClassSectionId,
      fromAcademicSessionId: payload.fromAcademicSessionId,
      toAcademicSessionId: payload.toAcademicSessionId,
      actorUserId: actor.id,
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'student.promote_class',
      entity: 'ClassSection',
      entityId: payload.fromClassSectionId,
      after: {
        toClassSectionId: payload.toClassSectionId,
        promoted: result.promoted.length,
        held: result.held.length,
      },
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return fail(error, 'students PUT');
  }
}

/** Bulk import from a parsed CSV payload. */
export async function PATCH(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.STUDENT_CREATE);
    await limit(request, 'students:import', 10, 60);

    const payload = await body(
      request,
      z.object({
        academicSessionId: z.string().min(1),
        rows: z
          .array(
            z.object({
              firstName: z.string().trim().min(1).max(60),
              lastName: z.string().trim().min(1).max(60),
              gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED']).default('UNDISCLOSED'),
              dateOfBirth: z
                .string()
                .regex(/^\d{4}-\d{2}-\d{2}$/)
                .optional()
                .nullable(),
              guardianName: z.string().trim().max(120).optional().nullable(),
              guardianPhone: z.string().trim().max(30).optional().nullable(),
              guardianEmail: z.string().trim().max(160).optional().nullable(),
              classSectionId: z.string().min(1),
            }),
          )
          .min(1, 'The file contained no rows.')
          .max(1000, 'Import at most 1000 rows at a time.'),
      }),
    );

    const result = await bulkImportStudents({
      rows: payload.rows.map((row) => ({
        ...row,
        gender: row.gender as Gender,
      })),
      academicSessionId: payload.academicSessionId,
      actorUserId: actor.id,
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'student.bulk_import',
      entity: 'Student',
      after: { imported: result.imported, failed: result.failed },
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return fail(error, 'students import');
  }
}
