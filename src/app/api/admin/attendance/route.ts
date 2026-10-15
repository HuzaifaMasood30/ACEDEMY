import { z } from 'zod';
import { NextResponse } from 'next/server';
import { fail, guard, limit, body, parseListQuery } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import {
  assertClassSectionAccess,
  assertStudentAccess,
  getTeacherScope,
} from '@/server/auth-guard';
import {
  markAttendance,
  dailyRegister,
  attendanceSummary,
  lowAttendanceStudents,
} from '@/server/services/attendance';
import { prisma } from '@/lib/prisma';
import { writeAudit } from '@/lib/audit';
import { Role } from '@prisma/client';

const markSchema = z.object({
  classSectionId: z.string().min(1),
  subjectId: z.string().min(1).optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format.'),
  period: z.string().trim().max(20).default('DAY'),
  entries: z
    .array(
      z.object({
        studentId: z.string().min(1),
        status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'LEAVE_APPROVED']),
        lateMinutes: z.coerce.number().int().min(0).max(600).optional().nullable(),
        remarks: z.string().trim().max(300).optional().nullable(),
      }),
    )
    .min(1, 'Provide at least one student.'),
});

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Read registers and attendance history.
 *
 * Every branch resolves scope from the database, so a teacher cannot read a
 * register for a class they do not teach by editing the query string.
 */
export async function GET(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.ATTENDANCE_VIEW);
    const query = parseListQuery(request);

    const classSectionId = query.params.get('classSectionId');
    const date = query.params.get('date');
    const studentId = query.params.get('studentId');

    if (studentId) {
      await assertStudentAccess(actor, studentId);

      const [summary, records] = await Promise.all([
        attendanceSummary({ studentId }),
        prisma.attendanceRecord.findMany({
          where: { studentId },
          orderBy: { attendanceSession: { date: 'desc' } },
          take: query.take,
          skip: query.skip,
          select: {
            id: true,
            status: true,
            lateMinutes: true,
            remarks: true,
            attendanceSession: {
              select: {
                date: true,
                period: true,
                classSection: { select: { id: true, name: true } },
                subject: { select: { id: true, name: true } },
              },
            },
          },
        }),
      ]);

      return NextResponse.json({
        data: {
          summary,
          records: records.map((record) => ({
            id: record.id,
            status: record.status,
            lateMinutes: record.lateMinutes,
            remarks: record.remarks,
            date: record.attendanceSession.date,
            period: record.attendanceSession.period,
            classSection: record.attendanceSession.classSection,
            subject: record.attendanceSession.subject,
          })),
        },
      });
    }

    if (classSectionId && date) {
      await assertClassSectionAccess(actor, classSectionId);
      return NextResponse.json({ data: await dailyRegister({ classSectionId, date }) });
    }

    if (classSectionId) {
      await assertClassSectionAccess(actor, classSectionId);
      return NextResponse.json({
        data: await lowAttendanceStudents({ classSectionId }),
      });
    }

    // Academy-wide listing is administrative only; teachers see their own classes.
    if (actor.role !== Role.ADMIN) {
      const scope = await getTeacherScope(actor);
      const rows = await Promise.all(
        scope.classSectionIds.map((id) =>
          dailyRegister({ classSectionId: id, date: date ?? todayIso() }),
        ),
      );
      return NextResponse.json({ data: rows });
    }

    const classes = await prisma.classSection.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        course: { select: { name: true } },
        _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
      },
    });

    return NextResponse.json({ data: classes });
  } catch (error) {
    return fail(error, 'attendance GET');
  }
}

/** Save a register. */
export async function POST(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.ATTENDANCE_MARK);
    await limit(request, 'attendance:mark', 120, 60);

    const payload = await body(request, markSchema);

    await assertClassSectionAccess(actor, payload.classSectionId);

    const result = await markAttendance({
      classSectionId: payload.classSectionId,
      subjectId: payload.subjectId ?? null,
      date: payload.date,
      period: payload.period,
      entries: payload.entries,
      markedByUserId: actor.id,
      markedByProfileId: actor.teacherProfileId,
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: result.created ? 'attendance.create' : 'attendance.update',
      entity: 'AttendanceSession',
      entityId: result.sessionId,
      after: {
        classSectionId: payload.classSectionId,
        date: payload.date,
        period: payload.period,
        saved: result.saved,
        absent: result.absentCount,
        notificationsQueued: result.notificationsQueued,
      },
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return fail(error, 'attendance POST');
  }
}

/** Download the register as CSV. */
export async function PUT(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.ATTENDANCE_VIEW);
    const payload = await body(
      request,
      z.object({
        classSectionId: z.string().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );

    await assertClassSectionAccess(actor, payload.classSectionId);

    const register = await dailyRegister({
      classSectionId: payload.classSectionId,
      date: payload.date,
    });

    const header = 'Admission No,Roll No,Student,Status,Late minutes,Remarks\n';
    const rows = register.rows
      .map((row) =>
        [
          row.student.admissionNo,
          row.student.rollNo ?? '',
          `"${`${row.student.firstName} ${row.student.lastName}`.trim()}"`,
          row.status ?? 'NOT_MARKED',
          row.lateMinutes ?? '',
          `"${(row.remarks ?? '').replace(/"/g, '""')}"`,
        ].join(','),
      )
      .join('\n');

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'attendance.export',
      entity: 'AttendanceSession',
      entityId: register.session?.id,
      after: { classSectionId: payload.classSectionId, date: payload.date },
    });

    return new NextResponse(header + rows, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="attendance-${payload.date}.csv"`,
      },
    });
  } catch (error) {
    return fail(error, 'attendance export');
  }
}
