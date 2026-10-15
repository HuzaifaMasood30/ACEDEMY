import { z } from 'zod';
import { NextResponse } from 'next/server';
import { fail, guard, limit, body } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { writeAudit } from '@/lib/audit';
import { conflict } from '@/lib/errors';
import {
  createSlot,
  rescheduleSlot,
  cancelSlot,
  assignSubstitute,
  classTimetable,
  teacherTimetable,
  teacherToday,
  teacherWorkload,
  detectConflicts,
  DAY_LABELS,
} from '@/server/services/timetable';
import { queueTimetableChangeNotifications } from '@/server/notifications/events';
import { timeOfDayToMinutes, minutesToTimeOfDay } from '@/lib/validation';
import { DayOfWeek } from '@prisma/client';

const DAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

const slotSchema = z.object({
  classSectionId: z.string().min(1),
  subjectId: z.string().min(1).optional().nullable(),
  teacherProfileId: z.string().min(1),
  roomId: z.string().min(1).optional().nullable(),
  batchId: z.string().min(1).optional().nullable(),
  dayOfWeek: z.enum(DAYS),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the HH:MM format.'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the HH:MM format.'),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().optional().nullable(),
  isBreak: z.boolean().default(false),
  label: z.string().trim().max(60).optional().nullable(),
  allowConflicts: z.boolean().default(false),
});

/** Timetable reads, scoped by role. */
export async function GET(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.TIMETABLE_VIEW);
    const params = new URL(request.url).searchParams;
    const scope = params.get('scope') ?? 'class';

    if (scope === 'teacher') {
      const teacherProfileId =
        actor.role === 'ADMIN'
          ? params.get('teacherProfileId')
          : actor.teacherProfileId;

      if (!teacherProfileId) {
        return NextResponse.json(
          { error: { code: 'VALIDATION', message: 'A teacher is required.' } },
          { status: 422 },
        );
      }

      const [weekly, today] = await Promise.all([
        teacherTimetable(teacherProfileId),
        teacherToday(teacherProfileId),
      ]);

      return NextResponse.json({ data: { weekly, today } });
    }

    if (scope === 'workload') {
      return NextResponse.json({ data: await teacherWorkload() });
    }

    if (scope === 'options') {
      // Everything the slot editor needs to populate its dropdowns.
      const [classes, teachers, subjects, rooms, sessions] = await Promise.all([
        prisma.classSection.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            courseId: true,
            course: { select: { name: true } },
            classSubjects: { select: { subjectId: true } },
          },
        }),
        prisma.teacherProfile.findMany({
          where: { isActive: true },
          orderBy: { user: { name: 'asc' } },
          select: {
            id: true,
            user: { select: { name: true } },
            teacherSubjects: { select: { subjectId: true } },
            maxWeeklyPeriods: true,
          },
        }),
        prisma.subject.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, code: true },
        }),
        prisma.room.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, capacity: true },
        }),
        prisma.academicSession.findMany({
          orderBy: { startDate: 'desc' },
          select: { id: true, name: true, code: true, startDate: true, endDate: true, isCurrent: true },
        }),
      ]);

      return NextResponse.json({
        data: { classes, teachers, subjects, rooms, sessions, dayLabels: DAY_LABELS },
      });
    }

    const classSectionId = params.get('classSectionId');
    if (!classSectionId) {
      const classes = await prisma.classSection.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, course: { select: { name: true } } },
      });
      return NextResponse.json({ data: { classes } });
    }

    return NextResponse.json({ data: await classTimetable(classSectionId) });
  } catch (error) {
    return fail(error, 'timetable GET');
  }
}

/** Create a slot, or preview conflicts without writing. */
export async function POST(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.TIMETABLE_MANAGE);
    await limit(request, 'timetable:write', 60, 60);

    const payload = await body(request, slotSchema);

    const input = {
      classSectionId: payload.classSectionId,
      subjectId: payload.subjectId ?? null,
      teacherProfileId: payload.teacherProfileId,
      roomId: payload.roomId ?? null,
      batchId: payload.batchId ?? null,
      dayOfWeek: payload.dayOfWeek as DayOfWeek,
      startMinute: timeOfDayToMinutes(payload.startTime),
      endMinute: timeOfDayToMinutes(payload.endTime),
      effectiveFrom: payload.effectiveFrom,
      effectiveTo: payload.effectiveTo ?? null,
      isBreak: payload.isBreak,
      label: payload.label ?? null,
    };

    if (input.endMinute <= input.startMinute) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message: 'The end time must be after the start time.',
          },
        },
        { status: 422 },
      );
    }

    const result = await createSlot(input, {
      allowConflicts: payload.allowConflicts,
      createdByUserId: actor.id,
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'timetable.create',
      entity: 'TimetableSlot',
      entityId: result.slotId,
      after: {
        classSectionId: input.classSectionId,
        dayOfWeek: input.dayOfWeek,
        start: payload.startTime,
        end: payload.endTime,
        conflictsOverridden: payload.allowConflicts && result.conflicts.length > 0,
        conflicts: result.conflicts,
      },
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return fail(error, 'timetable POST');
  }
}

/** Conflict preview for the editor — no writes. */
export async function PATCH(request: Request) {
  try {
    await guard(PERMISSIONS.TIMETABLE_MANAGE);
    await limit(request, 'timetable:check', 200, 60);

    const payload = await body(request, slotSchema);

    const conflicts = await detectConflicts({
      classSectionId: payload.classSectionId,
      subjectId: payload.subjectId ?? null,
      teacherProfileId: payload.teacherProfileId,
      roomId: payload.roomId ?? null,
      batchId: payload.batchId ?? null,
      dayOfWeek: payload.dayOfWeek as DayOfWeek,
      startMinute: timeOfDayToMinutes(payload.startTime),
      endMinute: timeOfDayToMinutes(payload.endTime),
      effectiveFrom: payload.effectiveFrom,
      effectiveTo: payload.effectiveTo ?? null,
    });

    return NextResponse.json({ data: conflicts });
  } catch (error) {
    return fail(error, 'timetable conflict check');
  }
}

/**
 * Change an existing slot: reschedule, cancel or substitute.
 *
 * Approved changes notify the affected guardians, so parents hear about a moved
 * lesson without anyone having to send a message by hand.
 */
export async function PUT(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.TIMETABLE_MANAGE);
    await limit(request, 'timetable:change', 60, 60);

    const payload = await body(
      request,
      z.discriminatedUnion('action', [
        z.object({
          action: z.literal('reschedule'),
          slotId: z.string().min(1),
          dayOfWeek: z.enum(DAYS),
          startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          effectiveFrom: z.coerce.date(),
          roomId: z.string().min(1).optional().nullable(),
          teacherProfileId: z.string().min(1).optional().nullable(),
          reason: z.string().trim().max(300).optional(),
          allowConflicts: z.boolean().default(false),
          notify: z.boolean().default(true),
        }),
        z.object({
          action: z.literal('cancel'),
          slotId: z.string().min(1),
          reason: z.string().trim().min(3).max(300),
          notify: z.boolean().default(true),
        }),
        z.object({
          action: z.literal('substitute'),
          slotId: z.string().min(1),
          substituteTeacherProfileId: z.string().min(1),
          date: z.coerce.date(),
          reason: z.string().trim().max(300).optional(),
          notify: z.boolean().default(true),
        }),
      ]),
    );

    if (payload.action === 'reschedule') {
      if (timeOfDayToMinutes(payload.endTime) <= timeOfDayToMinutes(payload.startTime)) {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION',
              message: 'The end time must be after the start time.',
            },
          },
          { status: 422 },
        );
      }

      const result = await rescheduleSlot({
        slotId: payload.slotId,
        dayOfWeek: payload.dayOfWeek as DayOfWeek,
        startMinute: timeOfDayToMinutes(payload.startTime),
        endMinute: timeOfDayToMinutes(payload.endTime),
        effectiveFrom: payload.effectiveFrom,
        roomId: payload.roomId ?? null,
        teacherProfileId: payload.teacherProfileId ?? null,
        reason: payload.reason,
        allowConflicts: payload.allowConflicts,
        actorUserId: actor.id,
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'timetable.reschedule',
        entity: 'TimetableSlot',
        entityId: payload.slotId,
        after: {
          dayOfWeek: payload.dayOfWeek,
          start: payload.startTime,
          end: payload.endTime,
          reason: payload.reason ?? null,
        },
      });

      return NextResponse.json({ data: result });
    }

    if (payload.action === 'cancel') {
      const result = await cancelSlot({
        slotId: payload.slotId,
        reason: payload.reason,
        actorUserId: actor.id,
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'timetable.cancel',
        entity: 'TimetableSlot',
        entityId: payload.slotId,
        after: { reason: payload.reason },
      });

      return NextResponse.json({ data: result });
    }

    const result = await assignSubstitute({
      slotId: payload.slotId,
      substituteTeacherProfileId: payload.substituteTeacherProfileId,
      date: payload.date,
      actorUserId: actor.id,
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'timetable.substitute',
      entity: 'TimetableSlot',
      entityId: payload.slotId,
      after: {
        substituteTeacherProfileId: payload.substituteTeacherProfileId,
        reason: payload.reason ?? null,
      },
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return fail(error, 'timetable PUT');
  }
}
