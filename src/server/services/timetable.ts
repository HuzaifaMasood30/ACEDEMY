import { prisma } from '@/lib/prisma';
import { conflict, notFound, validationError } from '@/lib/errors';
import { DayOfWeek, TimetableStatus } from '@prisma/client';

export interface SlotInput {
  classSectionId: string;
  subjectId?: string | null;
  teacherProfileId: string;
  roomId?: string | null;
  batchId?: string | null;
  dayOfWeek: DayOfWeek;
  startMinute: number;
  endMinute: number;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  isBreak?: boolean;
  label?: string | null;
}

export interface ConflictDetail {
  kind: 'TEACHER' | 'ROOM' | 'CLASS' | 'BATCH' | 'TEACHER_AVAILABILITY';
  message: string;
  conflictingSlotId?: string;
  conflictingWith: string;
}

export interface ConflictCheckResult {
  hasConflicts: boolean;
  conflicts: ConflictDetail[];
}

/**
 * Detect scheduling conflicts.
 *
 * A conflict is any overlap on the same weekday whose effective date ranges
 * intersect. Overlap is computed as `start < otherEnd && end > otherStart`,
 * which correctly treats back-to-back periods (09:00–10:00 then 10:00–11:00)
 * as non-conflicting.
 *
 * This runs on the server before every write, so a direct API call cannot
 * bypass the check the way a client-only validation would allow.
 */
export async function detectConflicts(
  input: SlotInput,
  options: { excludeSlotId?: string } = {},
): Promise<ConflictCheckResult> {
  const conflicts: ConflictDetail[] = [];

  if (input.startMinute >= input.endMinute) {
    throw validationError('The end time must be after the start time.');
  }
  if (input.startMinute < 0 || input.endMinute > 24 * 60) {
    throw validationError('Times must fall within a single day.');
  }

  const rangeEnd = input.effectiveTo ?? new Date('2999-12-31T00:00:00.000Z');
  const rangeStart = input.effectiveFrom;

  const overlapping = await prisma.timetableSlot.findMany({
    where: {
      id: options.excludeSlotId ? { not: options.excludeSlotId } : undefined,
      dayOfWeek: input.dayOfWeek,
      status: { not: TimetableStatus.CANCELLED },
      isBreak: false,
      // Effective ranges intersect.
      effectiveFrom: { lte: rangeEnd },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: rangeStart } }],
      // Time ranges overlap.
      AND: [
        { startMinute: { lt: input.endMinute } },
        { endMinute: { gt: input.startMinute } },
      ],
    },
    include: {
      classSection: { select: { id: true, name: true } },
      teacherProfile: { select: { id: true, user: { select: { name: true } } } },
      room: { select: { id: true, name: true } },
      subject: { select: { name: true } },
      batch: { select: { id: true, name: true } },
    },
  });

  for (const slot of overlapping) {
    const timeLabel = `${formatMinutes(slot.startMinute)}–${formatMinutes(slot.endMinute)}`;

    if (slot.teacherProfileId === input.teacherProfileId) {
      conflicts.push({
        kind: 'TEACHER',
        message: `${slot.teacherProfile.user.name} already teaches ${slot.classSection.name} (${slot.subject?.name ?? 'session'}) at ${timeLabel} on ${labelDay(input.dayOfWeek)}.`,
        conflictingSlotId: slot.id,
        conflictingWith: slot.teacherProfile.user.name,
      });
    }

    if (input.roomId && slot.roomId === input.roomId) {
      conflicts.push({
        kind: 'ROOM',
        message: `${slot.room?.name ?? 'This room'} is already booked for ${slot.classSection.name} at ${timeLabel} on ${labelDay(input.dayOfWeek)}.`,
        conflictingSlotId: slot.id,
        conflictingWith: slot.room?.name ?? 'Room',
      });
    }

    if (slot.classSectionId === input.classSectionId) {
      conflicts.push({
        kind: 'CLASS',
        message: `${slot.classSection.name} already has ${slot.subject?.name ?? 'a session'} scheduled at ${timeLabel} on ${labelDay(input.dayOfWeek)}.`,
        conflictingSlotId: slot.id,
        conflictingWith: slot.classSection.name,
      });
    }

    if (input.batchId && slot.batchId === input.batchId) {
      conflicts.push({
        kind: 'BATCH',
        message: `${slot.batch?.name ?? 'This batch'} already has a session at ${timeLabel} on ${labelDay(input.dayOfWeek)}.`,
        conflictingSlotId: slot.id,
        conflictingWith: slot.batch?.name ?? 'Batch',
      });
    }
  }

  // A teacher on approved leave for the effective window cannot be scheduled.
  const leave = await prisma.leaveRequest.findFirst({
    where: {
      teacherProfileId: input.teacherProfileId,
      status: 'APPROVED',
      startDate: { lte: rangeEnd },
      endDate: { gte: rangeStart },
    },
    include: { teacherProfile: { include: { user: { select: { name: true } } } } },
  });

  if (leave) {
    conflicts.push({
      kind: 'TEACHER_AVAILABILITY',
      message: `${leave.teacherProfile?.user.name ?? 'This teacher'} has approved leave from ${leave.startDate.toISOString().slice(0, 10)} to ${leave.endDate.toISOString().slice(0, 10)}.`,
      conflictingWith: leave.teacherProfile?.user.name ?? 'Teacher',
    });
  }

  return { hasConflicts: conflicts.length > 0, conflicts };
}

export interface CreateSlotResult {
  created: boolean;
  slotId?: string;
  conflicts: ConflictDetail[];
}

/**
 * Create a timetable slot.
 *
 * `allowConflicts` lets an administrator deliberately override a warning —
 * useful for genuinely parallel sessions — but the override is still recorded
 * so it can be reviewed later.
 */
export async function createSlot(
  input: SlotInput,
  options: { allowConflicts?: boolean; createdByUserId?: string } = {},
): Promise<CreateSlotResult> {
  const check = await detectConflicts(input);

  if (check.hasConflicts && !options.allowConflicts) {
    throw conflict(
      `This slot conflicts with ${check.conflicts.length} existing session(s). Resolve the conflicts or explicitly override them.`,
      { conflicts: check.conflicts },
    );
  }

  const [classSection, teacher, subject] = await Promise.all([
    prisma.classSection.findUnique({
      where: { id: input.classSectionId },
      select: { id: true, isActive: true },
    }),
    prisma.teacherProfile.findUnique({
      where: { id: input.teacherProfileId },
      select: { id: true, isActive: true },
    }),
    input.subjectId
      ? prisma.subject.findUnique({ where: { id: input.subjectId }, select: { id: true } })
      : Promise.resolve(null),
  ]);

  if (!classSection) throw notFound('Class not found.');
  if (!teacher) throw notFound('Teacher not found.');
  if (!teacher.isActive) throw conflict('This teacher is inactive and cannot be scheduled.');
  if (input.subjectId && !subject) throw notFound('Subject not found.');

  const slot = await prisma.timetableSlot.create({
    data: {
      classSectionId: input.classSectionId,
      subjectId: input.subjectId ?? null,
      teacherProfileId: input.teacherProfileId,
      roomId: input.roomId ?? null,
      batchId: input.batchId ?? null,
      dayOfWeek: input.dayOfWeek,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
      isBreak: input.isBreak ?? false,
      label: input.label ?? null,
      createdBy: options.createdByUserId ?? null,
    },
    select: { id: true },
  });

  return { created: true, slotId: slot.id, conflicts: check.conflicts };
}

/**
 * Move a slot to a new time, keeping the original for the change history.
 *
 * The original is marked RESCHEDULED rather than deleted, so "what changed and
 * when" stays answerable and notifications can reference both versions.
 */
export async function rescheduleSlot(options: {
  slotId: string;
  dayOfWeek: DayOfWeek;
  startMinute: number;
  endMinute: number;
  effectiveFrom: Date;
  roomId?: string | null;
  teacherProfileId?: string | null;
  reason?: string;
  allowConflicts?: boolean;
  actorUserId: string;
}) {
  const original = await prisma.timetableSlot.findUnique({
    where: { id: options.slotId },
    include: {
      classSection: { select: { id: true, name: true } },
      subject: { select: { name: true } },
      teacherProfile: { select: { id: true, user: { select: { name: true } } } },
    },
  });

  if (!original) throw notFound('Timetable slot not found.');

  const check = await detectConflicts(
    {
      classSectionId: original.classSectionId,
      subjectId: original.subjectId,
      teacherProfileId: options.teacherProfileId ?? original.teacherProfileId,
      roomId: options.roomId ?? original.roomId,
      batchId: original.batchId,
      dayOfWeek: options.dayOfWeek,
      startMinute: options.startMinute,
      endMinute: options.endMinute,
      effectiveFrom: options.effectiveFrom,
    },
    { excludeSlotId: original.id },
  );

  if (check.hasConflicts && !options.allowConflicts) {
    throw conflict(
      `The new time conflicts with ${check.conflicts.length} session(s).`,
      { conflicts: check.conflicts },
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.timetableSlot.update({
      where: { id: original.id },
      data: {
        status: TimetableStatus.RESCHEDULED,
        cancelReason: options.reason ?? 'Rescheduled',
      },
    });

    const replacement = await tx.timetableSlot.create({
      data: {
        classSectionId: original.classSectionId,
        subjectId: original.subjectId,
        teacherProfileId: options.teacherProfileId ?? original.teacherProfileId,
        roomId: options.roomId ?? original.roomId,
        batchId: original.batchId,
        dayOfWeek: options.dayOfWeek,
        startMinute: options.startMinute,
        endMinute: options.endMinute,
        effectiveFrom: options.effectiveFrom,
        effectiveTo: original.effectiveTo,
        isBreak: original.isBreak,
        label: original.label,
        originalSlotId: original.id,
        createdBy: options.actorUserId,
      },
    });

    return { original, replacement, conflicts: check.conflicts };
  });
}

/** Cancel a slot and identify everyone who must be told. */
export async function cancelSlot(options: {
  slotId: string;
  reason: string;
  actorUserId: string;
}) {
  const slot = await prisma.timetableSlot.findUnique({
    where: { id: options.slotId },
    include: {
      classSection: {
        select: {
          id: true,
          name: true,
          enrollments: {
            where: { status: 'ACTIVE' },
            select: { studentId: true },
          },
        },
      },
      teacherProfile: {
        select: { id: true, userId: true, user: { select: { name: true } } },
      },
      subject: { select: { name: true } },
    },
  });

  if (!slot) throw notFound('Timetable slot not found.');
  if (slot.status === TimetableStatus.CANCELLED) {
    throw conflict('This session is already cancelled.');
  }

  const updated = await prisma.timetableSlot.update({
    where: { id: slot.id },
    data: { status: TimetableStatus.CANCELLED, cancelReason: options.reason },
  });

  return {
    slot: updated,
    affected: {
      teacherUserId: slot.teacherProfile.userId,
      teacherName: slot.teacherProfile.user.name,
      studentIds: slot.classSection.enrollments.map((e) => e.studentId),
      className: slot.classSection.name,
      subjectName: slot.subject?.name ?? null,
    },
  };
}

/**
 * Assign a substitute teacher for one date.
 *
 * A substitute is stored on a new slot dated to that day so the original
 * recurring schedule stays intact.
 */
export async function assignSubstitute(options: {
  slotId: string;
  substituteTeacherProfileId: string;
  date: Date;
  actorUserId: string;
}) {
  const slot = await prisma.timetableSlot.findUnique({
    where: { id: options.slotId },
    include: { classSection: { select: { name: true } } },
  });

  if (!slot) throw notFound('Timetable slot not found.');

  const substitute = await prisma.teacherProfile.findUnique({
    where: { id: options.substituteTeacherProfileId },
    select: { id: true, isActive: true, user: { select: { name: true } } },
  });

  if (!substitute) throw notFound('Substitute teacher not found.');
  if (!substitute.isActive) throw conflict('This teacher is inactive.');

  const check = await detectConflicts(
    {
      classSectionId: slot.classSectionId,
      subjectId: slot.subjectId,
      teacherProfileId: substitute.id,
      roomId: slot.roomId,
      dayOfWeek: slot.dayOfWeek,
      startMinute: slot.startMinute,
      endMinute: slot.endMinute,
      effectiveFrom: options.date,
      effectiveTo: options.date,
    },
    { excludeSlotId: slot.id },
  );

  if (check.hasConflicts) {
    throw conflict(
      `${substitute.user.name} is not free at this time.`,
      { conflicts: check.conflicts },
    );
  }

  return prisma.timetableSlot.create({
    data: {
      classSectionId: slot.classSectionId,
      subjectId: slot.subjectId,
      teacherProfileId: substitute.id,
      substituteTeacherId: substitute.id,
      roomId: slot.roomId,
      batchId: slot.batchId,
      dayOfWeek: slot.dayOfWeek,
      startMinute: slot.startMinute,
      endMinute: slot.endMinute,
      effectiveFrom: options.date,
      effectiveTo: options.date,
      originalSlotId: slot.id,
      label: `Substitute for ${substitute.user.name}`,
      createdBy: options.actorUserId,
    },
  });
}

/** Weekly grid for one class, grouped by weekday. */
export async function classTimetable(classSectionId: string) {
  const slots = await prisma.timetableSlot.findMany({
    where: {
      classSectionId,
      status: { not: TimetableStatus.CANCELLED },
    },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      teacherProfile: { select: { id: true, user: { select: { name: true } } } },
      substituteTeacher: { select: { id: true, user: { select: { name: true } } } },
      room: { select: { id: true, name: true } },
      batch: { select: { id: true, name: true } },
    },
    orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
  });

  const days: DayOfWeek[] = [
    DayOfWeek.MONDAY,
    DayOfWeek.TUESDAY,
    DayOfWeek.WEDNESDAY,
    DayOfWeek.THURSDAY,
    DayOfWeek.FRIDAY,
    DayOfWeek.SATURDAY,
    DayOfWeek.SUNDAY,
  ];

  return days.map((day) => ({
    day,
    slots: slots
      .filter((slot) => slot.dayOfWeek === day)
      .map((slot) => ({
        id: slot.id,
        startMinute: slot.startMinute,
        endMinute: slot.endMinute,
        subjectName: slot.subject?.name ?? slot.label ?? 'Session',
        subjectCode: slot.subject?.code ?? null,
        teacherName: slot.substituteTeacher?.user.name ?? slot.teacherProfile.user.name,
        isSubstitute: Boolean(slot.substituteTeacher),
        roomName: slot.room?.name ?? null,
        batchName: slot.batch?.name ?? null,
        isBreak: slot.isBreak,
      })),
  }));
}

/** Weekly grid for a teacher, across every class they teach. */
export async function teacherTimetable(teacherProfileId: string) {
  const slots = await prisma.timetableSlot.findMany({
    where: { teacherProfileId, status: { not: TimetableStatus.CANCELLED } },
    include: {
      subject: { select: { name: true, code: true } },
      classSection: { select: { id: true, name: true } },
      room: { select: { name: true } },
      batch: { select: { name: true } },
    },
    orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
  });

  return slots.map((slot) => ({
    id: slot.id,
    dayOfWeek: slot.dayOfWeek,
    startMinute: slot.startMinute,
    endMinute: slot.endMinute,
    subjectName: slot.subject?.name ?? slot.label ?? 'Session',
    className: slot.classSection.name,
    classSectionId: slot.classSection.id,
    roomName: slot.room?.name ?? null,
    batchName: slot.batch?.name ?? null,
  }));
}

/** Today's schedule for a teacher, resolved against the current weekday. */
export async function teacherToday(teacherProfileId: string, now = new Date()) {
  const day = weekdayEnum(now);
  const slots = await prisma.timetableSlot.findMany({
    where: {
      teacherProfileId,
      dayOfWeek: day,
      status: { not: TimetableStatus.CANCELLED },
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
    },
    include: {
      subject: { select: { name: true } },
      classSection: { select: { id: true, name: true } },
      room: { select: { name: true } },
    },
    orderBy: { startMinute: 'asc' },
  });

  return slots.map((slot) => ({
    id: slot.id,
    startMinute: slot.startMinute,
    endMinute: slot.endMinute,
    subjectName: slot.subject?.name ?? slot.label ?? 'Session',
    className: slot.classSection.name,
    classSectionId: slot.classSection.id,
    roomName: slot.room?.name ?? null,
  }));
}

/** Teacher workload in weekly periods, for the admin workload report. */
export async function teacherWorkload() {
  const teachers = await prisma.teacherProfile.findMany({
    where: { isActive: true },
    include: {
      user: { select: { name: true, email: true } },
      timetableSlots: {
        where: { status: { not: TimetableStatus.CANCELLED } },
        select: { startMinute: true, endMinute: true, classSectionId: true },
      },
      _count: { select: { teacherSubjects: true, classTeacherOf: true } },
    },
  });

  return teachers
    .map((teacher) => {
      const periods = teacher.timetableSlots.length;
      const minutes = teacher.timetableSlots.reduce(
        (sum, slot) => sum + (slot.endMinute - slot.startMinute),
        0,
      );
      const distinctClasses = new Set(
        teacher.timetableSlots.map((s) => s.classSectionId),
      ).size;

      return {
        teacherProfileId: teacher.id,
        name: teacher.user.name,
        email: teacher.user.email,
        designation: teacher.designation,
        weeklyPeriods: periods,
        weeklyHours: Math.round((minutes / 60) * 10) / 10,
        maxWeeklyPeriods: teacher.maxWeeklyPeriods,
        utilisation:
          teacher.maxWeeklyPeriods > 0
            ? Math.round((periods / teacher.maxWeeklyPeriods) * 1000) / 10
            : null,
        distinctClasses,
        subjectCount: teacher._count.teacherSubjects,
        isClassTeacherOf: teacher._count.classTeacherOf,
        isOverloaded: periods > teacher.maxWeeklyPeriods,
      };
    })
    .sort((a, b) => b.weeklyPeriods - a.weeklyPeriods);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function weekdayEnum(date: Date): DayOfWeek {
  const index = date.getUTCDay();
  return (
    [
      DayOfWeek.SUNDAY,
      DayOfWeek.MONDAY,
      DayOfWeek.TUESDAY,
      DayOfWeek.WEDNESDAY,
      DayOfWeek.THURSDAY,
      DayOfWeek.FRIDAY,
      DayOfWeek.SATURDAY,
    ] as DayOfWeek[]
  )[index];
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const DAY_LABELS: Record<DayOfWeek, string> = {
  [DayOfWeek.MONDAY]: 'Monday',
  [DayOfWeek.TUESDAY]: 'Tuesday',
  [DayOfWeek.WEDNESDAY]: 'Wednesday',
  [DayOfWeek.THURSDAY]: 'Thursday',
  [DayOfWeek.FRIDAY]: 'Friday',
  [DayOfWeek.SATURDAY]: 'Saturday',
  [DayOfWeek.SUNDAY]: 'Sunday',
};

function labelDay(day: DayOfWeek): string {
  return DAY_LABELS[day];
}
