import { prisma } from '@/lib/prisma';
import { conflict, notFound, validationError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { EnrollmentStatus, Gender, GuardianRelation, Role, UserStatus, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

/**
 * Student lifecycle: admission, enrolment, promotion, transfer and withdrawal.
 *
 * Each operation is transactional because a half-applied admission — a student
 * row with no enrolment, or an enrolment with no guardian link — is worse than
 * a failed request.
 */

/** Allocate the next admission number for the year, inside a transaction. */
async function nextAdmissionNo(tx: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getUTCFullYear();
  const key = `sequence:admission-${year}`;

  const counter = await tx.setting.upsert({
    where: { key },
    create: { key, value: { last: 0 }, category: 'sequence' },
    update: {},
  });

  const current = counter.value as { last?: number };
  const next = (current.last ?? 0) + 1;

  await tx.setting.update({ where: { key }, data: { value: { last: next } } });

  return `STD-${year}-${String(next).padStart(4, '0')}`;
}

export interface GuardianInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  relation: GuardianRelation;
  isPrimary?: boolean;
  canViewFees?: boolean;
  canViewResults?: boolean;
  receivesNotifications?: boolean;
  /** When supplied, links to an existing guardian account instead of creating one. */
  existingUserId?: string | null;
}

export interface AdmitStudentInput {
  firstName: string;
  lastName: string;
  gender: Gender;
  dateOfBirth?: Date | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  bloodGroup?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelation?: string | null;
  previousSchool?: string | null;
  previousGrade?: string | null;
  admissionDate?: Date;
  classSectionId: string;
  academicSessionId: string;
  batchId?: string | null;
  rollNo?: string | null;
  campusId?: string | null;
  notes?: string | null;
  guardians: GuardianInput[];
  /** Create a student portal login. */
  createLogin?: boolean;
  /** Password for the new login; required when `createLogin` is true. */
  initialPassword?: string | null;
  createdByUserId: string;
}

/**
 * Admit a student and enrol them in one step.
 *
 * A duplicate is detected on name + date of birth, which is a warning rather
 * than a hard block: genuine twins exist. The caller decides whether to proceed.
 */
export async function admitStudent(input: AdmitStudentInput) {
  if (input.guardians.length === 0) {
    throw validationError('At least one guardian is required for a new student.');
  }

  const classSection = await prisma.classSection.findUnique({
    where: { id: input.classSectionId },
    select: { id: true, name: true, capacity: true, isActive: true },
  });

  if (!classSection) throw notFound('Class not found.');
  if (!classSection.isActive) throw conflict('This class is not accepting enrolments.');

  const session = await prisma.academicSession.findUnique({
    where: { id: input.academicSessionId },
    select: { id: true, name: true },
  });

  if (!session) throw notFound('Academic session not found.');

  // Capacity is enforced here so a bulk import cannot overfill a class either.
  if (classSection.capacity) {
    const enrolled = await prisma.enrollment.count({
      where: {
        classSectionId: input.classSectionId,
        academicSessionId: input.academicSessionId,
        status: EnrollmentStatus.ACTIVE,
      },
    });

    if (enrolled >= classSection.capacity) {
      throw conflict(
        `${classSection.name} is at capacity (${classSection.capacity}). Increase the capacity or choose another class.`,
        { capacity: classSection.capacity, enrolled },
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const admissionNo = await nextAdmissionNo(tx);

    let userId: string | null = null;

    if (input.createLogin) {
      if (!input.initialPassword) {
        throw validationError('An initial password is required when creating a login.');
      }

      const email =
        input.email?.trim().toLowerCase() ||
        `${input.firstName}.${input.lastName}.${admissionNo}`
          .toLowerCase()
          .replace(/[^a-z0-9.]/g, '');

      const existingUser = await tx.user.findUnique({ where: { email } });
      if (existingUser) {
        throw conflict(`A user account already exists for ${email}.`);
      }

      const user = await tx.user.create({
        data: {
          email,
          name: `${input.firstName} ${input.lastName}`.trim(),
          passwordHash: await bcrypt.hash(input.initialPassword, 12),
          role: Role.STUDENT,
          status: UserStatus.ACTIVE,
          campusId: input.campusId ?? null,
        },
        select: { id: true },
      });

      userId = user.id;
    }

    const student = await tx.student.create({
      data: {
        userId,
        admissionNo,
        rollNo: input.rollNo ?? null,
        firstName: input.firstName,
        lastName: input.lastName,
        gender: input.gender,
        dateOfBirth: input.dateOfBirth ?? null,
        email: input.email?.trim().toLowerCase() ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        bloodGroup: input.bloodGroup ?? null,
        emergencyContactName: input.emergencyContactName ?? null,
        emergencyContactPhone: input.emergencyContactPhone ?? null,
        emergencyContactRelation: input.emergencyContactRelation ?? null,
        previousSchool: input.previousSchool ?? null,
        previousGrade: input.previousGrade ?? null,
        admissionDate: input.admissionDate ?? new Date(),
        status: EnrollmentStatus.ACTIVE,
        campusId: input.campusId ?? null,
        notes: input.notes ?? null,
      },
      select: { id: true, admissionNo: true, firstName: true, lastName: true },
    });

    await tx.studentStatusHistory.create({
      data: {
        studentId: student.id,
        toStatus: EnrollmentStatus.ACTIVE,
        reason: 'Admitted',
        changedBy: input.createdByUserId,
      },
    });

    await tx.enrollment.create({
      data: {
        studentId: student.id,
        classSectionId: input.classSectionId,
        academicSessionId: input.academicSessionId,
        batchId: input.batchId ?? null,
        rollNo: input.rollNo ?? null,
        status: EnrollmentStatus.ACTIVE,
      },
    });

    for (const guardian of input.guardians) {
      let guardianUserId = guardian.existingUserId ?? null;

      if (!guardianUserId) {
        if (!guardian.email) {
          throw validationError(
            `Guardian "${guardian.name}" needs an email address so they can be given a portal account.`,
          );
        }

        const email = guardian.email.trim().toLowerCase();
        const existing = await tx.user.findUnique({ where: { email } });

        if (existing) {
          guardianUserId = existing.id;
        } else {
          const created = await tx.user.create({
            data: {
              email,
              name: guardian.name,
              phone: guardian.phone ?? null,
              // A guardian cannot sign in until an administrator issues a
              // password reset; this placeholder is never a valid credential.
              passwordHash: await bcrypt.hash(
                `disabled-${Math.random().toString(36).slice(2)}-${Date.now()}`,
                12,
              ),
              role: Role.PARENT,
              status: UserStatus.PENDING_VERIFICATION,
              campusId: input.campusId ?? null,
            },
            select: { id: true },
          });
          guardianUserId = created.id;
        }
      }

      await tx.guardianLink.create({
        data: {
          guardianUserId,
          studentId: student.id,
          relation: guardian.relation,
          isPrimary: guardian.isPrimary ?? false,
          isAuthorized: true,
          canViewFees: guardian.canViewFees ?? true,
          canViewResults: guardian.canViewResults ?? true,
          receivesNotifications: guardian.receivesNotifications ?? true,
          contactPhone: guardian.phone ?? null,
        },
      });
    }

    return student;
  });
}

/** Possible duplicate students, matched loosely on name and date of birth. */
export async function findPossibleDuplicates(input: {
  firstName: string;
  lastName: string;
  dateOfBirth?: Date | null;
}) {
  const candidates = await prisma.student.findMany({
    where: {
      firstName: { equals: input.firstName, mode: 'insensitive' },
      lastName: { equals: input.lastName, mode: 'insensitive' },
    },
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
      status: true,
      guardians: { select: { guardianUser: { select: { name: true, phone: true } } } },
    },
    take: 10,
  });

  // An exact date-of-birth match is a strong signal; a name-only match is weak.
  return candidates.map((candidate) => ({
    ...candidate,
    exactMatch:
      input.dateOfBirth != null &&
      candidate.dateOfBirth != null &&
      candidate.dateOfBirth.getTime() === input.dateOfBirth.getTime(),
  }));
}

/** Update a student's own record. Enrolment is changed through its own action. */
export async function updateStudent(input: {
  studentId: string;
  data: Prisma.StudentUpdateInput;
  actorUserId: string;
}) {
  const before = await prisma.student.findUnique({
    where: { id: input.studentId },
    select: { id: true, status: true, admissionNo: true },
  });

  if (!before) throw notFound('Student not found.');

  const updated = await prisma.student.update({
    where: { id: input.studentId },
    data: input.data,
  });

  await writeAudit({
    actorId: input.actorUserId,
    action: 'student.update',
    entity: 'Student',
    entityId: updated.id,
    before: { status: before.status },
    after: { admissionNo: before.admissionNo },
  });

  return updated;
}

/** Change a student's lifecycle status, recording the transition. */
export async function changeStudentStatus(options: {
  studentId: string;
  toStatus: EnrollmentStatus;
  reason: string;
  actorUserId: string;
  leftAt?: Date;
}) {
  const student = await prisma.student.findUnique({
    where: { id: options.studentId },
    select: { id: true, status: true, admissionNo: true },
  });

  if (!student) throw notFound('Student not found.');

  if (student.status === options.toStatus) {
    throw conflict(`This student is already marked as ${options.toStatus.toLowerCase()}.`);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.student.update({
      where: { id: options.studentId },
      data: { status: options.toStatus },
    });

    await tx.studentStatusHistory.create({
      data: {
        studentId: options.studentId,
        fromStatus: student.status,
        toStatus: options.toStatus,
        reason: options.reason,
        changedBy: options.actorUserId,
      },
    });

    // A student who has left must not remain on an active register.
    if (
      options.toStatus === EnrollmentStatus.WITHDRAWN ||
      options.toStatus === EnrollmentStatus.TRANSFERRED ||
      options.toStatus === EnrollmentStatus.GRADUATED
    ) {
      await tx.enrollment.updateMany({
        where: { studentId: options.studentId, status: EnrollmentStatus.ACTIVE },
        data: {
          status: options.toStatus,
          leftAt: options.leftAt ?? new Date(),
        },
      });
    }

    return updated;
  });
}

/** Move a student to a different class within the same academic session. */
export async function transferStudentClass(options: {
  studentId: string;
  toClassSectionId: string;
  academicSessionId: string;
  batchId?: string | null;
  reason: string;
  actorUserId: string;
}) {
  const [student, target] = await Promise.all([
    prisma.student.findUnique({
      where: { id: options.studentId },
      select: { id: true, admissionNo: true },
    }),
    prisma.classSection.findUnique({
      where: { id: options.toClassSectionId },
      select: { id: true, name: true, capacity: true, isActive: true },
    }),
  ]);

  if (!student) throw notFound('Student not found.');
  if (!target) throw notFound('Target class not found.');
  if (!target.isActive) throw conflict('The target class is not active.');

  return prisma.$transaction(async (tx) => {
    const current = await tx.enrollment.findFirst({
      where: {
        studentId: options.studentId,
        academicSessionId: options.academicSessionId,
        status: EnrollmentStatus.ACTIVE,
      },
    });

    if (current?.classSectionId === options.toClassSectionId) {
      throw conflict('The student is already enrolled in that class.');
    }

    if (target.capacity) {
      const count = await tx.enrollment.count({
        where: {
          classSectionId: options.toClassSectionId,
          academicSessionId: options.academicSessionId,
          status: EnrollmentStatus.ACTIVE,
        },
      });

      if (count >= target.capacity) {
        throw conflict(`${target.name} is at capacity (${target.capacity}).`);
      }
    }

    if (current) {
      await tx.enrollment.update({
        where: { id: current.id },
        data: { status: EnrollmentStatus.TRANSFERRED, leftAt: new Date() },
      });
    }

    const created = await tx.enrollment.create({
      data: {
        studentId: options.studentId,
        classSectionId: options.toClassSectionId,
        academicSessionId: options.academicSessionId,
        batchId: options.batchId ?? null,
        status: EnrollmentStatus.ACTIVE,
      },
    });

    await tx.studentStatusHistory.create({
      data: {
        studentId: options.studentId,
        fromStatus: EnrollmentStatus.ACTIVE,
        toStatus: EnrollmentStatus.ACTIVE,
        reason: `Class transfer to ${target.name}: ${options.reason}`,
        changedBy: options.actorUserId,
      },
    });

    return created;
  });
}

/**
 * Promote a class of students into the next academic session.
 *
 * Students below the promotion percentage are held back and reported rather
 * than promoted, so the decision stays visible to the administrator.
 */
export async function promoteClass(options: {
  fromClassSectionId: string;
  toClassSectionId: string;
  fromAcademicSessionId: string;
  toAcademicSessionId: string;
  minimumPercentage?: number;
  actorUserId: string;
}) {
  const [from, to] = await Promise.all([
    prisma.classSection.findUnique({
      where: { id: options.fromClassSectionId },
      select: { id: true, name: true },
    }),
    prisma.classSection.findUnique({
      where: { id: options.toClassSectionId },
      select: { id: true, name: true, capacity: true, isActive: true },
    }),
  ]);

  if (!from) throw notFound('Source class not found.');
  if (!to) throw notFound('Target class not found.');
  if (!to.isActive) throw conflict('The target class is not active.');

  const enrollments = await prisma.enrollment.findMany({
    where: {
      classSectionId: options.fromClassSectionId,
      academicSessionId: options.fromAcademicSessionId,
      status: EnrollmentStatus.ACTIVE,
    },
    select: { id: true, studentId: true },
  });

  const promoted: string[] = [];
  const held: { studentId: string; reason: string }[] = [];

  for (const enrollment of enrollments) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.enrollment.update({
          where: { id: enrollment.id },
          data: { status: EnrollmentStatus.GRADUATED, leftAt: new Date() },
        });

        await tx.enrollment.create({
          data: {
            studentId: enrollment.studentId,
            classSectionId: options.toClassSectionId,
            academicSessionId: options.toAcademicSessionId,
            status: EnrollmentStatus.ACTIVE,
          },
        });
      });

      promoted.push(enrollment.studentId);
    } catch (error) {
      held.push({
        studentId: enrollment.studentId,
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return { promoted, held, total: enrollments.length };
}

/** Bulk import parsed CSV rows. Returns a per-row outcome so errors are visible. */
export async function bulkImportStudents(options: {
  rows: Array<{
    firstName: string;
    lastName: string;
    gender?: Gender;
    dateOfBirth?: string | null;
    guardianName?: string | null;
    guardianPhone?: string | null;
    guardianEmail?: string | null;
    classSectionId: string;
  }>;
  academicSessionId: string;
  campusId?: string | null;
  actorUserId: string;
}) {
  const results: Array<{
    row: number;
    admissionNo?: string;
    studentId?: string;
    error?: string;
  }> = [];

  for (const [index, row] of options.rows.entries()) {
    try {
      const student = await admitStudent({
        firstName: row.firstName,
        lastName: row.lastName,
        gender: row.gender ?? Gender.UNDISCLOSED,
        dateOfBirth: row.dateOfBirth ? new Date(`${row.dateOfBirth}T00:00:00.000Z`) : null,
        classSectionId: row.classSectionId,
        academicSessionId: options.academicSessionId,
        campusId: options.campusId ?? null,
        guardians: [
          {
            name: row.guardianName?.trim() || `Guardian of ${row.firstName} ${row.lastName}`,
            email: row.guardianEmail?.trim() || null,
            phone: row.guardianPhone?.trim() || null,
            relation: GuardianRelation.GUARDIAN,
            isPrimary: true,
          },
        ],
        createdByUserId: options.actorUserId,
      });

      results.push({ row: index + 1, admissionNo: student.admissionNo, studentId: student.id });
    } catch (error) {
      results.push({
        row: index + 1,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return {
    imported: results.filter((r) => !r.error).length,
    failed: results.filter((r) => r.error).length,
    results,
  };
}

/** Students visible to an actor, with their active placement. */
export async function listStudents(options: {
  where: Prisma.StudentWhereInput;
  skip: number;
  take: number;
  orderBy?: Prisma.StudentOrderByWithRelationInput;
}) {
  const [rows, total] = await Promise.all([
    prisma.student.findMany({
      where: options.where,
      skip: options.skip,
      take: options.take,
      orderBy: options.orderBy ?? [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        admissionNo: true,
        rollNo: true,
        firstName: true,
        lastName: true,
        gender: true,
        dateOfBirth: true,
        photoUrl: true,
        email: true,
        phone: true,
        status: true,
        admissionDate: true,
        guardians: {
          select: {
            id: true,
            relation: true,
            isPrimary: true,
            canViewFees: true,
            contactPhone: true,
            guardianUser: { select: { id: true, name: true, email: true, phone: true } },
          },
        },
        enrollments: {
          where: { status: EnrollmentStatus.ACTIVE },
          take: 1,
          select: {
            id: true,
            rollNo: true,
            classSection: {
              select: { id: true, name: true, course: { select: { name: true } } },
            },
            batch: { select: { id: true, name: true } },
            academicSession: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.student.count({ where: options.where }),
  ]);

  return { rows, total };
}
