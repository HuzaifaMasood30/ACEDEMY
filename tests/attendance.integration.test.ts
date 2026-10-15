import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient, AttendanceStatus } from '@prisma/client';
import {
  markAttendance,
  attendanceSummary,
  consecutiveAbsences,
} from '@/server/services/attendance';

/**
 * Attendance runs against the real database.
 *
 * The suite builds its own class, students and guardian so it can assert the
 * absence-notification path end to end without touching seeded data.
 */

const prisma = new PrismaClient();
const PREFIX = 'VITEST-ATT-';

let adminUserId: string;
let classSectionId: string;
let studentA: string;
let studentB: string;
let guardianUserId: string;
let guardianLinkId: string;
let academicSessionId: string;
const createdDates: string[] = [];

async function cleanup() {
  const studentIds = [studentA, studentB].filter(Boolean);

  if (studentIds.length > 0) {
    await prisma.notificationJob.deleteMany({ where: { studentId: { in: studentIds } } });
    await prisma.attendanceRecord.deleteMany({ where: { studentId: { in: studentIds } } });
    await prisma.enrollment.deleteMany({ where: { studentId: { in: studentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
  }

  // Every clause below is guarded on an id. Prisma treats an `undefined` value
  // as "no filter", so an unguarded deleteMany here would run as an unfiltered
  // DELETE and wipe the academy's own classes and enrolments if `beforeAll`
  // had thrown before the fixture ids were assigned.
  if (classSectionId) {
    await prisma.attendanceRecord.deleteMany({
      where: { attendanceSession: { classSectionId } },
    });
    await prisma.attendanceSession.deleteMany({ where: { classSectionId } });
    await prisma.enrollment.deleteMany({ where: { classSectionId } });
    await prisma.classSection.deleteMany({ where: { id: classSectionId } });
  }

  if (guardianLinkId) await prisma.guardianLink.deleteMany({ where: { id: guardianLinkId } });
  if (guardianUserId) await prisma.user.deleteMany({ where: { id: guardianUserId } });
}

/**
 * Sweep anything a previous crashed run left behind.
 *
 * The per-test fixtures create records under the VITEST-ATT- prefix, so any row
 * still carrying it at startup belongs to an aborted run and can be removed
 * safely. Without this a single mid-suite failure would leave students that no
 * later run would clean up.
 */
async function sweepStaleFixtures() {
  const stale = await prisma.student.findMany({
    where: { admissionNo: { startsWith: PREFIX } },
    select: { id: true },
  });
  const staleIds = stale.map((s) => s.id);

  if (staleIds.length > 0) {
    await prisma.notificationJob.deleteMany({ where: { studentId: { in: staleIds } } });
    await prisma.attendanceRecord.deleteMany({ where: { studentId: { in: staleIds } } });
    await prisma.enrollment.deleteMany({ where: { studentId: { in: staleIds } } });
    await prisma.student.deleteMany({ where: { id: { in: staleIds } } });
  }

  const staleSections = await prisma.classSection.findMany({
    where: { name: { startsWith: PREFIX } },
    select: { id: true },
  });
  for (const section of staleSections) {
    await prisma.attendanceRecord.deleteMany({
      where: { attendanceSession: { classSectionId: section.id } },
    });
    await prisma.attendanceSession.deleteMany({ where: { classSectionId: section.id } });
    await prisma.enrollment.deleteMany({ where: { classSectionId: section.id } });
    await prisma.classSection.delete({ where: { id: section.id } });
  }

  await prisma.user.deleteMany({ where: { email: { contains: PREFIX } } });
}

beforeAll(async () => {
  await sweepStaleFixtures();

  const admin = await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' } });
  adminUserId = admin.id;

  const course = await prisma.course.findFirstOrThrow();
  // A class belongs to an academic session, so reuse the active one.
  const session =
    (await prisma.academicSession.findFirst({ where: { isCurrent: true } })) ??
    (await prisma.academicSession.findFirstOrThrow());

  academicSessionId = session.id;

  const section = await prisma.classSection.create({
    data: {
      name: `${PREFIX}Section`,
      courseId: course.id,
      academicSessionId: session.id,
      capacity: 40,
    },
  });
  classSectionId = section.id;

  const a = await prisma.student.create({
    data: {
      admissionNo: `${PREFIX}A-${Date.now()}`,
      firstName: 'Att',
      lastName: 'Alpha',
      status: 'ACTIVE',
      admissionDate: new Date(),
    },
  });
  const b = await prisma.student.create({
    data: {
      admissionNo: `${PREFIX}B-${Date.now()}`,
      firstName: 'Att',
      lastName: 'Beta',
      status: 'ACTIVE',
      admissionDate: new Date(),
    },
  });
  studentA = a.id;
  studentB = b.id;

  for (const studentId of [studentA, studentB]) {
    await prisma.enrollment.create({
      data: {
        studentId,
        classSectionId,
        academicSessionId,
        status: 'ACTIVE',
        enrolledAt: new Date(),
      },
    });
  }

  const guardian = await prisma.user.create({
    data: {
      email: `${PREFIX}${Date.now()}@example.test`,
      name: 'Att Guardian',
      role: 'PARENT',
      status: 'ACTIVE',
      phone: '+923000000000',
      passwordHash: 'x',
    },
  });
  guardianUserId = guardian.id;

  const link = await prisma.guardianLink.create({
    data: {
      studentId: studentA,
      guardianUserId: guardian.id,
      relation: 'FATHER',
      isPrimary: true,
      receivesNotifications: true,
    },
  });
  guardianLinkId = link.id;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

/**
 * Absence alerts accumulate across tests because several of them mark the same
 * students absent. Clearing them before each test keeps the job counts in each
 * assertion scoped to that test alone.
 */
beforeEach(async () => {
  const studentIds = [studentA, studentB].filter(Boolean);
  if (studentIds.length > 0) {
    await prisma.notificationJob.deleteMany({
      where: { studentId: { in: studentIds }, category: 'ATTENDANCE_ABSENCE' },
    });
  }
});

/**
 * A distinct past date per call. Attendance may not be recorded for a future
 * date, so fixtures walk backwards from yesterday and each call gets its own
 * day so that sessions from different tests cannot collide.
 */
let dayCounter = 0;
function nextDate(): string {
  dayCounter += 1;
  const date = new Date(Date.now() - dayCounter * 86_400_000).toISOString().slice(0, 10);
  createdDates.push(date);
  return date;
}

describe('markAttendance', () => {
  it('saves a register and reports the absent count', async () => {
    const date = nextDate();
    const result = await markAttendance({
      classSectionId,
      date,
      entries: [
        { studentId: studentA, status: AttendanceStatus.PRESENT },
        { studentId: studentB, status: AttendanceStatus.ABSENT },
      ],
      markedByUserId: adminUserId,
    });

    expect(result.created).toBe(true);
    expect(result.saved).toBe(2);
    expect(result.absentCount).toBe(1);
  });

  it('is idempotent: re-saving the same register updates rather than duplicates', async () => {
    const date = nextDate();

    await markAttendance({
      classSectionId,
      date,
      entries: [{ studentId: studentA, status: AttendanceStatus.ABSENT }],
      markedByUserId: adminUserId,
    });
    const second = await markAttendance({
      classSectionId,
      date,
      entries: [{ studentId: studentA, status: AttendanceStatus.PRESENT }],
      markedByUserId: adminUserId,
    });

    expect(second.created).toBe(false);
    const records = await prisma.attendanceRecord.findMany({
      where: { studentId: studentA, attendanceSession: { date: new Date(date) } },
    });
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe(AttendanceStatus.PRESENT);
  });

  it('records late minutes alongside the status', async () => {
    const date = nextDate();
    await markAttendance({
      classSectionId,
      date,
      entries: [
        { studentId: studentA, status: AttendanceStatus.LATE, lateMinutes: 12 },
      ],
      markedByUserId: adminUserId,
    });

    const record = await prisma.attendanceRecord.findFirstOrThrow({
      where: { studentId: studentA, attendanceSession: { date: new Date(date) } },
    });
    expect(record.status).toBe(AttendanceStatus.LATE);
    expect(record.lateMinutes).toBe(12);
  });
});

describe('attendanceSummary', () => {
  it('counts late, excused and approved leave as attended', async () => {
    const student = await prisma.student.create({
      data: {
        admissionNo: `${PREFIX}SUM-${Date.now()}`,
        firstName: 'Sum',
        lastName: 'Mary',
        status: 'ACTIVE',
        admissionDate: new Date(),
      },
    });
    await prisma.enrollment.create({
      data: {
        studentId: student.id,
        classSectionId,
        academicSessionId,
        status: 'ACTIVE',
        enrolledAt: new Date(),
      },
    });

    const statuses = [
      AttendanceStatus.PRESENT,
      AttendanceStatus.PRESENT,
      AttendanceStatus.LATE,
      AttendanceStatus.EXCUSED,
      AttendanceStatus.LEAVE_APPROVED,
      AttendanceStatus.ABSENT,
      AttendanceStatus.ABSENT,
      AttendanceStatus.ABSENT,
      AttendanceStatus.ABSENT,
      AttendanceStatus.ABSENT,
    ];

    for (const status of statuses) {
      const date = nextDate();
      await markAttendance({
        classSectionId,
        date,
        entries: [{ studentId: student.id, status }],
        markedByUserId: adminUserId,
      });
    }

    const summary = await attendanceSummary({ studentId: student.id });
    expect(summary.total).toBe(10);
    expect(summary.present).toBe(2);
    expect(summary.late).toBe(1);
    expect(summary.excused).toBe(1);
    expect(summary.leaveApproved).toBe(1);
    expect(summary.absent).toBe(5);
    // 5 attended of 10 scheduled sessions.
    expect(summary.attended).toBe(5);
    expect(summary.percentage).toBe(50);

    await prisma.attendanceRecord.deleteMany({ where: { studentId: student.id } });
    await prisma.enrollment.deleteMany({ where: { studentId: student.id } });
    await prisma.student.delete({ where: { id: student.id } });
  });

  it('reports a null percentage when nothing is recorded', async () => {
    const student = await prisma.student.create({
      data: {
        admissionNo: `${PREFIX}NIL-${Date.now()}`,
        firstName: 'Nil',
        lastName: 'Record',
        status: 'ACTIVE',
        admissionDate: new Date(),
      },
    });

    const summary = await attendanceSummary({ studentId: student.id });
    expect(summary.total).toBe(0);
    expect(summary.percentage).toBeNull();
    expect(summary.rules.minimumPercentage).toBeGreaterThan(0);

    await prisma.student.delete({ where: { id: student.id } });
  });

  it('honours a date window', async () => {
    const student = await prisma.student.create({
      data: {
        admissionNo: `${PREFIX}WIN-${Date.now()}`,
        firstName: 'Win',
        lastName: 'Dow',
        status: 'ACTIVE',
        admissionDate: new Date(),
      },
    });
    await prisma.enrollment.create({
      data: {
        studentId: student.id,
        classSectionId,
        academicSessionId,
        status: 'ACTIVE',
        enrolledAt: new Date(),
      },
    });

    const newestDate = nextDate();
    const olderDate = nextDate();
    for (const [date, status] of [
      [newestDate, AttendanceStatus.PRESENT],
      [olderDate, AttendanceStatus.ABSENT],
    ] as const) {
      await markAttendance({
        classSectionId,
        date,
        entries: [{ studentId: student.id, status }],
        markedByUserId: adminUserId,
      });
    }

    const all = await attendanceSummary({ studentId: student.id });
    // `nextDate` counts backwards, so the first date taken here is the newest.
    const later = await attendanceSummary({
      studentId: student.id,
      from: new Date(newestDate),
    });

    expect(all.total).toBe(2);
    expect(later.total).toBe(1);

    await prisma.attendanceRecord.deleteMany({ where: { studentId: student.id } });
    await prisma.enrollment.deleteMany({ where: { studentId: student.id } });
    await prisma.student.delete({ where: { id: student.id } });
  });
});

describe('consecutiveAbsences', () => {
  it('counts the run of most recent absences', async () => {
    const student = await prisma.student.create({
      data: {
        admissionNo: `${PREFIX}CON-${Date.now()}`,
        firstName: 'Con',
        lastName: 'Sec',
        status: 'ACTIVE',
        admissionDate: new Date(),
      },
    });
    await prisma.enrollment.create({
      data: {
        studentId: student.id,
        classSectionId,
        academicSessionId,
        status: 'ACTIVE',
        enrolledAt: new Date(),
      },
    });

    // `nextDate` walks backwards, so recording the absences first makes them
    // the most recent sessions — which is what the counter inspects.
    const statuses = [
      AttendanceStatus.ABSENT,
      AttendanceStatus.ABSENT,
      AttendanceStatus.ABSENT,
      AttendanceStatus.PRESENT,
    ];
    for (const status of statuses) {
      const date = nextDate();
      await markAttendance({
        classSectionId,
        date,
        entries: [{ studentId: student.id, status }],
        markedByUserId: adminUserId,
      });
    }

    expect(await consecutiveAbsences(student.id)).toBe(3);

    await prisma.attendanceRecord.deleteMany({ where: { studentId: student.id } });
    await prisma.enrollment.deleteMany({ where: { studentId: student.id } });
    await prisma.student.delete({ where: { id: student.id } });
  });
});

describe('absence notifications', () => {
  it('queues one alert per guardian when a student is absent', async () => {
    const date = nextDate();
    const marked = await markAttendance({
      classSectionId,
      date,
      entries: [{ studentId: studentA, status: AttendanceStatus.ABSENT }],
      markedByUserId: adminUserId,
    });
    expect(marked.absentCount).toBe(1);
    // markAttendance queues the alert itself, after the register has committed.
    expect(marked.notificationsQueued).toBe(1);

    const jobs = await prisma.notificationJob.findMany({
      where: { studentId: studentA, category: 'ATTENDANCE_ABSENCE' },
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('QUEUED');
    expect(jobs[0].body).toContain('Att Alpha');
  });

  it('does not queue a second alert when the register is re-saved', async () => {
    const date = nextDate();

    const first = await markAttendance({
      classSectionId,
      date,
      entries: [{ studentId: studentA, status: AttendanceStatus.ABSENT }],
      markedByUserId: adminUserId,
    });
    expect(first.notificationsQueued).toBe(1);

    // Correcting an unrelated detail and re-saving the same register must not
    // re-notify the guardian. The session is reused, and the dedupe key is
    // derived from the session and student rather than the record id, so the
    // rewritten record still collides with the original message.
    const second = await markAttendance({
      classSectionId,
      date,
      entries: [
        { studentId: studentA, status: AttendanceStatus.ABSENT, remarks: 'Corrected' },
      ],
      markedByUserId: adminUserId,
    });

    expect(second.sessionId).toBe(first.sessionId);
    expect(second.created).toBe(false);
    expect(second.notificationsQueued).toBe(0);

    const jobs = await prisma.notificationJob.count({
      where: { studentId: studentA, category: 'ATTENDANCE_ABSENCE' },
    });
    expect(jobs).toBe(1);
  });

  it('does not re-alert when a student is toggled absent → present → absent', async () => {
    // The register is replaced wholesale on each save, so the record id changes
    // every time. Without a stable dedupe key this sequence would send three
    // messages for what is a single day of absence.
    const date = nextDate();

    const absent1 = await markAttendance({
      classSectionId,
      date,
      entries: [{ studentId: studentA, status: AttendanceStatus.ABSENT }],
      markedByUserId: adminUserId,
    });
    expect(absent1.notificationsQueued).toBe(1);

    const present = await markAttendance({
      classSectionId,
      date,
      entries: [{ studentId: studentA, status: AttendanceStatus.PRESENT }],
      markedByUserId: adminUserId,
    });
    expect(present.notificationsQueued).toBe(0);

    const absent2 = await markAttendance({
      classSectionId,
      date,
      entries: [{ studentId: studentA, status: AttendanceStatus.ABSENT }],
      markedByUserId: adminUserId,
    });
    expect(absent2.notificationsQueued).toBe(0);

    const jobs = await prisma.notificationJob.count({
      where: { studentId: studentA, category: 'ATTENDANCE_ABSENCE' },
    });
    expect(jobs).toBe(1);
  });

  it('leaves the attendance record intact when no guardian is reachable', async () => {
    // studentB has no guardian link at all.
    const date = nextDate();
    const marked = await markAttendance({
      classSectionId,
      date,
      entries: [{ studentId: studentB, status: AttendanceStatus.ABSENT }],
      markedByUserId: adminUserId,
    });

    expect(marked.notificationsQueued).toBe(0);
    expect(marked.notificationsSkipped).toBeGreaterThan(0);

    // The register itself must be unaffected by the notification outcome.
    const record = await prisma.attendanceRecord.findFirstOrThrow({
      where: { studentId: studentB, attendanceSessionId: marked.sessionId },
    });
    expect(record.status).toBe(AttendanceStatus.ABSENT);
  });
});
