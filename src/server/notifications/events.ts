import { prisma } from '@/lib/prisma';
import { academyConfig } from '@/lib/config';
import { formatDate } from '@/lib/format';
import { getAcademyProfile } from '@/server/settings';
import { dedupeKeys, enqueueNotification } from './queue';
import { NotificationCategory } from '@prisma/client';

/**
 * Event-driven notification fan-out.
 *
 * Every function here is idempotent: the dedupe key is derived from the
 * underlying event, and the unique index on `NotificationJob.dedupeKey` means a
 * repeated call — whether from a retried request, a double-click or a worker
 * replay — cannot produce a second message.
 *
 * Notifying is always best-effort relative to the business operation. A failure
 * to queue must never roll back a published result, a saved timetable change or
 * an announcement.
 */

export interface FanOutResult {
  queued: number;
  skipped: number;
  recipients: number;
}

/** Guardians eligible to receive WhatsApp messages for these students. */
async function eligibleGuardians(studentIds: string[]) {
  if (studentIds.length === 0) return [];

  return prisma.guardianLink.findMany({
    where: {
      studentId: { in: studentIds },
      isAuthorized: true,
      receivesNotifications: true,
      guardianUser: { status: 'ACTIVE' },
    },
    select: {
      studentId: true,
      contactPhone: true,
      guardianUser: { select: { id: true, name: true, phone: true } },
      student: { select: { id: true, firstName: true, lastName: true } },
    },
  });
}

type Guardian = Awaited<ReturnType<typeof eligibleGuardians>>[number];

function phoneOf(guardian: Guardian): string | null {
  return guardian.contactPhone ?? guardian.guardianUser.phone ?? null;
}

function nameOf(guardian: Guardian): string {
  return `${guardian.student.firstName} ${guardian.student.lastName}`.trim();
}

/** Tell guardians their child's examination results are published. */
export async function queueResultNotifications(options: {
  examId: string;
  examName: string;
  studentIds: string[];
  actorUserId?: string;
}): Promise<number> {
  const profile = await getAcademyProfile();
  const guardians = await eligibleGuardians(options.studentIds);

  let queued = 0;

  for (const guardian of guardians) {
    const phone = phoneOf(guardian);
    if (!phone) continue;

    const result = await enqueueNotification({
      category: NotificationCategory.RESULT_PUBLISHED,
      dedupeKey: dedupeKeys.resultPublished(options.examId, guardian.studentId),
      recipientUserId: guardian.guardianUser.id,
      recipientPhone: phone,
      studentId: guardian.studentId,
      relatedEntity: 'Exam',
      relatedEntityId: options.examId,
      templateKey: 'result_published',
      context: {
        guardianName: guardian.guardianUser.name,
        studentName: nameOf(guardian),
        examName: options.examName,
        academyName: profile.name,
      },
      payload: { examId: options.examId },
      createdByUserId: options.actorUserId ?? null,
    });

    if (result.created) queued += 1;
  }

  return queued;
}

/**
 * Announce to a set of guardians.
 *
 * `recipientKey` makes the dedupe key unique per announcement and recipient so
 * re-running an announcement cannot spam anyone.
 */
export async function queueAnnouncementNotifications(options: {
  announcementId: string;
  title: string;
  body: string;
  studentIds?: string[];
  classSectionIds?: string[];
  createdByUserId?: string;
}): Promise<FanOutResult> {
  const profile = await getAcademyProfile();

  let studentIds = options.studentIds ?? [];

  if (studentIds.length === 0 && (options.classSectionIds?.length ?? 0) > 0) {
    const enrollments = await prisma.enrollment.findMany({
      where: {
        classSectionId: { in: options.classSectionIds },
        status: 'ACTIVE',
      },
      select: { studentId: true },
    });
    studentIds = Array.from(new Set(enrollments.map((e) => e.studentId)));
  }

  const guardians = await eligibleGuardians(studentIds);

  let queued = 0;
  let skipped = 0;

  for (const guardian of guardians) {
    const phone = phoneOf(guardian);
    if (!phone) {
      skipped += 1;
      continue;
    }

    const result = await enqueueNotification({
      category: NotificationCategory.ANNOUNCEMENT,
      dedupeKey: dedupeKeys.announcement(options.announcementId, guardian.guardianUser.id),
      recipientUserId: guardian.guardianUser.id,
      recipientPhone: phone,
      studentId: guardian.studentId,
      relatedEntity: 'Announcement',
      relatedEntityId: options.announcementId,
      templateKey: 'announcement',
      context: {
        title: options.title,
        body: options.body,
        academyName: profile.name,
      },
      payload: { announcementId: options.announcementId },
      createdByUserId: options.createdByUserId ?? null,
    });

    if (result.created) queued += 1;
    else skipped += 1;
  }

  return { queued, skipped, recipients: guardians.length };
}

/** Tell guardians a class's schedule changed. */
export async function queueTimetableChangeNotifications(options: {
  slotId: string;
  changeStamp: string;
  changeSummary: string;
  classSectionId: string;
  effectiveDate?: Date;
  createdByUserId?: string;
}): Promise<FanOutResult> {
  const profile = await getAcademyProfile();

  const [enrollments, classSection] = await Promise.all([
    prisma.enrollment.findMany({
      where: { classSectionId: options.classSectionId, status: 'ACTIVE' },
      select: { studentId: true },
    }),
    prisma.classSection.findUnique({
      where: { id: options.classSectionId },
      select: { name: true },
    }),
  ]);

  const studentIds = Array.from(new Set(enrollments.map((e) => e.studentId)));
  const guardians = await eligibleGuardians(studentIds);

  let queued = 0;
  let skipped = 0;

  for (const guardian of guardians) {
    const phone = phoneOf(guardian);
    if (!phone) {
      skipped += 1;
      continue;
    }

    const result = await enqueueNotification({
      category: NotificationCategory.TIMETABLE_CHANGE,
      dedupeKey: dedupeKeys.timetableChange(options.slotId, options.changeStamp),
      recipientUserId: guardian.guardianUser.id,
      recipientPhone: phone,
      studentId: guardian.studentId,
      relatedEntity: 'TimetableSlot',
      relatedEntityId: options.slotId,
      templateKey: 'timetable_change',
      context: {
        guardianName: guardian.guardianUser.name,
        studentName: nameOf(guardian),
        className: classSection?.name ?? '',
        date: formatDate(options.effectiveDate ?? new Date()),
        body: options.changeSummary,
        academyName: profile.name,
      },
      payload: { slotId: options.slotId, changeStamp: options.changeStamp },
      createdByUserId: options.createdByUserId ?? null,
    });

    if (result.created) queued += 1;
    else skipped += 1;
  }

  return { queued, skipped, recipients: guardians.length };
}

/** Tell guardians a new assignment has been set. */
export async function queueAssignmentNotifications(options: {
  assignmentId: string;
  assignmentTitle: string;
  subjectName: string;
  deadline: Date;
  classSectionId: string;
  createdByUserId?: string;
}): Promise<FanOutResult> {
  const profile = await getAcademyProfile();

  const enrollments = await prisma.enrollment.findMany({
    where: { classSectionId: options.classSectionId, status: 'ACTIVE' },
    select: { studentId: true },
  });

  const studentIds = Array.from(new Set(enrollments.map((e) => e.studentId)));
  const guardians = await eligibleGuardians(studentIds);

  let queued = 0;
  let skipped = 0;

  for (const guardian of guardians) {
    const phone = phoneOf(guardian);
    if (!phone) {
      skipped += 1;
      continue;
    }

    const result = await enqueueNotification({
      category: NotificationCategory.ASSIGNMENT_NEW,
      dedupeKey: dedupeKeys.assignmentNew(options.assignmentId, guardian.studentId),
      recipientUserId: guardian.guardianUser.id,
      recipientPhone: phone,
      studentId: guardian.studentId,
      relatedEntity: 'Assignment',
      relatedEntityId: options.assignmentId,
      templateKey: 'assignment_new',
      context: {
        guardianName: guardian.guardianUser.name,
        studentName: nameOf(guardian),
        assignmentTitle: options.assignmentTitle,
        subjectName: options.subjectName,
        deadline: formatDate(options.deadline),
        academyName: profile.name,
      },
      payload: { assignmentId: options.assignmentId },
      createdByUserId: options.createdByUserId ?? null,
    });

    if (result.created) queued += 1;
    else skipped += 1;
  }

  return { queued, skipped, recipients: guardians.length };
}

/** Resolve the WhatsApp display number for the admin configuration screen. */
export function academyWhatsAppDisplay(): string {
  return academyConfig.name;
}
