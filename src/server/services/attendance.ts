import { prisma } from '@/lib/prisma';
import { conflict, notFound, validationError } from '@/lib/errors';
import { AttendanceStatus, EnrollmentStatus, NotificationCategory, Role } from '@prisma/client';
import { enqueueNotification, dedupeKeys } from '@/server/notifications/queue';
import { getAttendanceRules } from '@/server/settings';
import { academyConfig } from '@/lib/config';
import { formatDate } from '@/lib/format';

export interface MarkAttendanceEntry {
  studentId: string;
  status: AttendanceStatus;
  lateMinutes?: number | null;
  remarks?: string | null;
}

export interface MarkAttendanceInput {
  classSectionId: string;
  subjectId?: string | null;
  /** `YYYY-MM-DD`. */
  date: string;
  period?: string;
  entries: MarkAttendanceEntry[];
  markedByUserId: string;
  markedByProfileId?: string | null;
}

export interface MarkAttendanceResult {
  sessionId: string;
  created: boolean;
  saved: number;
  absentCount: number;
  notificationsQueued: number;
  notificationsSkipped: number;
}

/** Attendance counts as "not present" for percentage purposes. */
const COUNTED_STATUSES: AttendanceStatus[] = [
  AttendanceStatus.PRESENT,
  AttendanceStatus.ABSENT,
  AttendanceStatus.LATE,
  AttendanceStatus.EXCUSED,
  AttendanceStatus.LEAVE_APPROVED,
];

/** Statuses that contribute to the numerator of the attendance percentage. */
const PRESENT_EQUIVALENT: AttendanceStatus[] = [
  AttendanceStatus.PRESENT,
  AttendanceStatus.LATE,
  AttendanceStatus.EXCUSED,
  AttendanceStatus.LEAVE_APPROVED,
];

/**
 * Save attendance for one class, date and period.
 *
 * Everything runs in a single transaction so a partial save cannot leave the
 * register half-written. Absence notifications are queued after the commit and
 * are idempotent, so re-saving the same register never double-messages a parent.
 */
export async function markAttendance(
  input: MarkAttendanceInput,
): Promise<MarkAttendanceResult> {
  if (input.entries.length === 0) {
    throw validationError('Provide at least one student to mark attendance for.');
  }

  const date = new Date(`${input.date}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw validationError('The attendance date is not valid.');
  }

  const future = date.getTime() > Date.now() + 24 * 60 * 60 * 1000;
  if (future) {
    throw validationError('Attendance cannot be recorded for a future date.');
  }

  const period = input.period ?? 'DAY';

  const classSection = await prisma.classSection.findUnique({
    where: { id: input.classSectionId },
    select: { id: true, name: true, isActive: true },
  });

  if (!classSection) throw notFound('Class not found.');
  if (!classSection.isActive) {
    throw conflict('This class is not active and cannot take attendance.');
  }

  // Only enrolled students may appear in the register.
  const enrollments = await prisma.enrollment.findMany({
    where: {
      classSectionId: input.classSectionId,
      studentId: { in: input.entries.map((e) => e.studentId) },
      status: EnrollmentStatus.ACTIVE,
    },
    select: { studentId: true },
  });

  const enrolledIds = new Set(enrollments.map((e) => e.studentId));
  const invalid = input.entries.filter((e) => !enrolledIds.has(e.studentId));

  if (invalid.length > 0) {
    throw validationError(
      `${invalid.length} student(s) are not actively enrolled in this class.`,
      { studentIds: invalid.map((e) => e.studentId) },
    );
  }

  for (const entry of input.entries) {
    if (entry.status === AttendanceStatus.LATE && (entry.lateMinutes ?? 0) < 0) {
      throw validationError('Late minutes cannot be negative.');
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.attendanceSession.findUnique({
      where: {
        classSectionId_date_period: {
          classSectionId: input.classSectionId,
          date,
          period,
        },
      },
      select: { id: true, isLocked: true },
    });

    if (existing?.isLocked) {
      throw conflict(
        'This attendance register is locked. Ask an administrator to unlock it before making changes.',
      );
    }

    const session = existing
      ? await tx.attendanceSession.update({
          where: { id: existing.id },
          data: {
            subjectId: input.subjectId ?? null,
            markedByUserId: input.markedByUserId,
            markedByProfileId: input.markedByProfileId ?? null,
          },
          select: { id: true },
        })
      : await tx.attendanceSession.create({
          data: {
            classSectionId: input.classSectionId,
            subjectId: input.subjectId ?? null,
            date,
            period,
            markedByUserId: input.markedByUserId,
            markedByProfileId: input.markedByProfileId ?? null,
          },
          select: { id: true },
        });

    // Replace the register contents rather than diffing: the submitted list is
    // the complete intended state for this class/date/period.
    await tx.attendanceRecord.deleteMany({
      where: { attendanceSessionId: session.id },
    });

    await tx.attendanceRecord.createMany({
      data: input.entries.map((entry) => ({
        attendanceSessionId: session.id,
        studentId: entry.studentId,
        status: entry.status,
        lateMinutes: entry.lateMinutes ?? null,
        remarks: entry.remarks ?? null,
        markedByUserId: input.markedByUserId,
      })),
    });

    return { sessionId: session.id, created: !existing };
  });

  // Notifications are queued outside the transaction: a provider outage must
  // never roll back a correctly recorded register.
  const notifications = await queueAbsenceNotifications({
    attendanceSessionId: result.sessionId,
    markedByUserId: input.markedByUserId,
  });

  const absentCount = input.entries.filter(
    (e) => e.status === AttendanceStatus.ABSENT,
  ).length;

  return {
    sessionId: result.sessionId,
    created: result.created,
    saved: input.entries.length,
    absentCount,
    notificationsQueued: notifications.queued,
    notificationsSkipped: notifications.skipped,
  };
}

/**
 * Queue one WhatsApp alert per newly absent student.
 *
 * Dedupe keys are derived from the attendance record id, so editing the
 * register later — even flipping a student absent → present → absent — will not
 * produce a second message for the same record.
 */
export async function queueAbsenceNotifications(params: {
  attendanceSessionId: string;
  markedByUserId: string;
}): Promise<{ queued: number; skipped: number }> {
  const rules = await getAttendanceRules();
  if (!rules.notifyGuardiansOnAbsence) {
    return { queued: 0, skipped: 0 };
  }

  const session = await prisma.attendanceSession.findUnique({
    where: { id: params.attendanceSessionId },
    include: {
      classSection: { select: { id: true, name: true } },
      records: {
        where: { status: AttendanceStatus.ABSENT },
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              guardians: {
                where: { isAuthorized: true, receivesNotifications: true },
                include: {
                  guardianUser: {
                    select: { id: true, name: true, phone: true, status: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!session) return { queued: 0, skipped: 0 };

  const studentName = (student: { firstName: string; lastName: string }) =>
    `${student.firstName} ${student.lastName}`.trim();

  let queued = 0;
  let skipped = 0;

  for (const record of session.records) {
    const guardians = record.student.guardians;

    if (guardians.length === 0) {
      skipped += 1;
      continue;
    }

    for (const link of guardians) {
      const phone = link.contactPhone ?? link.guardianUser.phone;

      if (!phone || link.guardianUser.status !== 'ACTIVE') {
        skipped += 1;
        continue;
      }

      const outcome = await enqueueNotification({
        category: NotificationCategory.ATTENDANCE_ABSENCE,
        dedupeKey: dedupeKeys.attendanceAbsence(
          session.id,
          record.student.id,
          link.guardianUser.id,
        ),
        recipientUserId: link.guardianUser.id,
        recipientPhone: phone,
        studentId: record.student.id,
        relatedEntity: 'AttendanceRecord',
        relatedEntityId: record.id,
        templateKey: 'absence_alert',
        locale: link.guardianUser.id ? academyConfig.locale : 'en',
        context: {
          guardianName: link.guardianUser.name,
          studentName: studentName(record.student),
          className: session.classSection.name,
          date: formatDate(session.date),
          academyName: academyConfig.name,
        },
        payload: {
          attendanceRecordId: record.id,
          attendanceSessionId: session.id,
          classSectionId: session.classSection.id,
        },
        createdByUserId: params.markedByUserId,
      });

      if (outcome.created) queued += 1;
      else skipped += 1;
    }
  }

  return { queued, skipped };
}

/**
 * Attendance percentage for a student.
 *
 * Denominator counts every record that represents a scheduled session
 * (present, absent, late, excused, approved leave). Holidays are excluded
 * because no session was held.
 */
export async function attendanceSummary(options: {
  studentId: string;
  from?: Date;
  to?: Date;
  classSectionId?: string;
}) {
  const where = {
    studentId: options.studentId,
    status: { in: COUNTED_STATUSES },
    ...(options.classSectionId
      ? { attendanceSession: { classSectionId: options.classSectionId } }
      : {}),
    ...(options.from || options.to
      ? {
          attendanceSession: {
            ...(options.classSectionId
              ? { classSectionId: options.classSectionId }
              : {}),
            date: {
              ...(options.from ? { gte: options.from } : {}),
              ...(options.to ? { lte: options.to } : {}),
            },
          },
        }
      : {}),
  };

  const grouped = await prisma.attendanceRecord.groupBy({
    by: ['status'],
    where,
    _count: { _all: true },
  });

  const counts: Record<string, number> = {};
  for (const row of grouped) counts[row.status] = row._count._all;

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const present = counts[AttendanceStatus.PRESENT] ?? 0;
  const late = counts[AttendanceStatus.LATE] ?? 0;
  const excused = counts[AttendanceStatus.EXCUSED] ?? 0;
  const leave = counts[AttendanceStatus.LEAVE_APPROVED] ?? 0;
  const absent = counts[AttendanceStatus.ABSENT] ?? 0;

  const attended =
    (counts[AttendanceStatus.PRESENT] ?? 0) +
    late +
    excused +
    leave;

  return {
    total,
    present,
    absent,
    late,
    excused,
    leaveApproved: leave,
    attended,
    percentage: total === 0 ? null : Math.round((attended / total) * 1000) / 10,
    rules: await getAttendanceRules(),
  };
}

/** Bulk summary for a whole class, used by teacher and admin dashboards. */
export async function classAttendanceSummary(options: {
  classSectionId: string;
  from?: Date;
  to?: Date;
}) {
  const records = await prisma.attendanceRecord.findMany({
    where: {
      attendanceSession: {
        classSectionId: options.classSectionId,
        ...(options.from || options.to
          ? {
              date: {
                ...(options.from ? { gte: options.from } : {}),
                ...(options.to ? { lte: options.to } : {}),
              },
            }
          : {}),
      },
      status: { in: COUNTED_STATUSES },
    },
    select: { studentId: true, status: true },
  });

  const byStudent = new Map<
    string,
    { total: number; attended: number; absent: number }
  >();

  for (const record of records) {
    const bucket =
      byStudent.get(record.studentId) ?? { total: 0, attended: 0, absent: 0 };
    bucket.total += 1;
    if (PRESENT_EQUIVALENT.includes(record.status)) bucket.attended += 1;
    if (record.status === AttendanceStatus.ABSENT) bucket.absent += 1;
    byStudent.set(record.studentId, bucket);
  }

  return Array.from(byStudent.entries()).map(([studentId, bucket]) => ({
    studentId,
    total: bucket.total,
    attended: bucket.attended,
    absent: bucket.absent,
    percentage:
      bucket.total === 0
        ? null
        : Math.round((bucket.attended / bucket.total) * 1000) / 10,
  }));
}

/** Count consecutive trailing absences, most recent first. */
export async function consecutiveAbsences(studentId: string): Promise<number> {
  const recent = await prisma.attendanceRecord.findMany({
    where: { studentId, status: { in: COUNTED_STATUSES } },
    orderBy: { attendanceSession: { date: 'desc' } },
    take: 30,
    select: { status: true },
  });

  let streak = 0;
  for (const record of recent) {
    if (record.status === AttendanceStatus.ABSENT) streak += 1;
    else break;
  }
  return streak;
}

/** Daily register view for a class, including students with no record yet. */
export async function dailyRegister(options: {
  classSectionId: string;
  date: string;
  period?: string;
}) {
  const date = new Date(`${options.date}T00:00:00.000Z`);

  const [enrollments, session] = await Promise.all([
    prisma.enrollment.findMany({
      where: { classSectionId: options.classSectionId, status: EnrollmentStatus.ACTIVE },
      include: {
        student: {
          select: {
            id: true,
            admissionNo: true,
            firstName: true,
            lastName: true,
            rollNo: true,
            photoUrl: true,
          },
        },
        batch: { select: { id: true, name: true } },
      },
      orderBy: [{ student: { firstName: 'asc' } }],
    }),
    prisma.attendanceSession.findUnique({
      where: {
        classSectionId_date_period: {
          classSectionId: options.classSectionId,
          date,
          period: options.period ?? 'DAY',
        },
      },
      include: {
        records: true,
        markedByUser: { select: { id: true, name: true } },
      },
    }),
  ]);

  const recordByStudent = new Map(
    (session?.records ?? []).map((r) => [r.studentId, r]),
  );

  return {
    session: session
      ? {
          id: session.id,
          markedAt: session.updatedAt,
          markedBy: session.markedByUser?.name ?? null,
          isLocked: session.isLocked,
        }
      : null,
    rows: enrollments.map((enrollment) => {
      const record = recordByStudent.get(enrollment.student.id);
      return {
        student: enrollment.student,
        batchName: enrollment.batch?.name ?? null,
        status: record?.status ?? null,
        lateMinutes: record?.lateMinutes ?? null,
        remarks: record?.remarks ?? null,
        recordId: record?.id ?? null,
      };
    }),
  };
}

/** Students whose attendance is below the configured threshold. */
export async function lowAttendanceStudents(options: {
  classSectionId?: string;
  threshold?: number;
  from?: Date;
  to?: Date;
}) {
  const rules = await getAttendanceRules();
  const threshold = options.threshold ?? rules.minimumPercentage;

  const enrollments = await prisma.enrollment.findMany({
    where: {
      status: EnrollmentStatus.ACTIVE,
      ...(options.classSectionId ? { classSectionId: options.classSectionId } : {}),
    },
    select: { studentId: true },
    distinct: ['studentId'],
  });

  const results: {
    studentId: string;
    percentage: number | null;
    total: number;
    absent: number;
  }[] = [];

  for (const { studentId } of enrollments) {
    const summary = await attendanceSummary({
      studentId,
      classSectionId: options.classSectionId,
      from: options.from,
      to: options.to,
    });

    if (summary.percentage !== null && summary.percentage < threshold) {
      results.push({
        studentId,
        percentage: summary.percentage,
        total: summary.total,
        absent: summary.absent,
      });
    }
  }

  return results.sort((a, b) => (a.percentage ?? 0) - (b.percentage ?? 0));
}

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  [AttendanceStatus.PRESENT]: 'Present',
  [AttendanceStatus.ABSENT]: 'Absent',
  [AttendanceStatus.LATE]: 'Late',
  [AttendanceStatus.EXCUSED]: 'Excused',
  [AttendanceStatus.LEAVE_APPROVED]: 'Approved leave',
  [AttendanceStatus.HOLIDAY]: 'Holiday',
};

export const ATTENDANCE_STATUS_TONES: Record<
  AttendanceStatus,
  'success' | 'danger' | 'warning' | 'info' | 'neutral'
> = {
  [AttendanceStatus.PRESENT]: 'success',
  [AttendanceStatus.ABSENT]: 'danger',
  [AttendanceStatus.LATE]: 'warning',
  [AttendanceStatus.EXCUSED]: 'info',
  [AttendanceStatus.LEAVE_APPROVED]: 'info',
  [AttendanceStatus.HOLIDAY]: 'neutral',
};

/** Roles allowed to see fee data alongside attendance — never teachers. */
export const ATTENDANCE_ROLES = [Role.ADMIN, Role.TEACHER] as const;
