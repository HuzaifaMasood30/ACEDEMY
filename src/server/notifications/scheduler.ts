import { prisma } from '@/lib/prisma';
import { logEvent } from '@/lib/audit';
import { academyConfig } from '@/lib/config';
import { formatDate, formatMoney } from '@/lib/format';
import { getAcademyProfile, getNotificationRules } from '@/server/settings';
import { dedupeKeys, enqueueNotification } from './queue';
import { NotificationCategory } from '@prisma/client';

/**
 * Recurring reminder generation.
 *
 * Each reminder carries a dedupe key derived from the underlying record plus a
 * time bucket, so running the scheduler twice — or running two scheduler
 * instances at once — cannot send the same reminder twice.
 */

export interface ScheduledReminderResult {
  feeReminders: number;
  examReminders: number;
  assignmentDueReminders: number;
}

/** Guardians who have consented to WhatsApp, with their children attached. */
async function guardiansForStudents(studentIds: string[]) {
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

type Guardian = Awaited<ReturnType<typeof guardiansForStudents>>[number];

/** Prefer the contact number recorded on the guardian link over the account's. */
function guardianPhone(guardian: Guardian): string | null {
  return guardian.contactPhone ?? guardian.guardianUser.phone ?? null;
}

function studentName(guardian: Guardian): string {
  return `${guardian.student.firstName} ${guardian.student.lastName}`.trim();
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysBetween(from: Date, to: Date): number {
  return Math.round(
    (startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime()) / 86_400_000,
  );
}

/**
 * Fee reminders.
 *
 * Two triggers: a reminder a few days before the due date, and a daily overdue
 * notice. Both are keyed on the invoice plus a day bucket, so neither repeats
 * within the same bucket.
 */
async function queueFeeReminders(now: Date): Promise<number> {
  const profile = await getAcademyProfile();
  const currency = academyConfig.currency;
  const reminderDays = 3;

  const horizon = new Date(now.getTime() + reminderDays * 86_400_000);

  const [dueSoon, overdue] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
        dueDate: { gte: now, lte: horizon },
        balance: { gt: 0 },
      },
      select: { id: true, invoiceNo: true, dueDate: true, balance: true, studentId: true },
      take: 500,
    }),
    prisma.invoice.findMany({
      where: {
        status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
        dueDate: { lt: now },
        balance: { gt: 0 },
      },
      select: { id: true, invoiceNo: true, dueDate: true, balance: true, studentId: true },
      take: 500,
    }),
  ]);

  const studentIds = Array.from(
    new Set([...dueSoon, ...overdue].map((invoice) => invoice.studentId)),
  );
  const guardians = await guardiansForStudents(studentIds);

  const guardianByStudent = new Map<string, Guardian[]>();
  for (const guardian of guardians) {
    const list = guardianByStudent.get(guardian.studentId) ?? [];
    list.push(guardian);
    guardianByStudent.set(guardian.studentId, list);
  }

  let queued = 0;

  for (const invoice of dueSoon) {
    const offset = daysBetween(now, invoice.dueDate);

    for (const guardian of guardianByStudent.get(invoice.studentId) ?? []) {
      const phone = guardianPhone(guardian);
      if (!phone) continue;

      const result = await enqueueNotification({
        category: NotificationCategory.FEE_REMINDER,
        dedupeKey: dedupeKeys.invoiceReminder(invoice.id, offset),
        recipientUserId: guardian.guardianUser.id,
        recipientPhone: phone,
        studentId: invoice.studentId,
        relatedEntity: 'Invoice',
        relatedEntityId: invoice.id,
        templateKey: 'fee_reminder',
        context: {
          guardianName: guardian.guardianUser.name,
          studentName: studentName(guardian),
          invoiceNo: invoice.invoiceNo,
          amount: formatMoney(Number(invoice.balance), currency),
          dueDate: formatDate(invoice.dueDate),
          academyName: profile.name,
        },
        payload: { invoiceId: invoice.id, kind: 'due_soon' },
      });

      if (result.created) queued += 1;
    }
  }

  const dayBucket = startOfUtcDay(now).toISOString().slice(0, 10);

  for (const invoice of overdue) {
    for (const guardian of guardianByStudent.get(invoice.studentId) ?? []) {
      const phone = guardianPhone(guardian);
      if (!phone) continue;

      const result = await enqueueNotification({
        category: NotificationCategory.FEE_OVERDUE,
        dedupeKey: dedupeKeys.invoiceOverdue(invoice.id, dayBucket),
        recipientUserId: guardian.guardianUser.id,
        recipientPhone: phone,
        studentId: invoice.studentId,
        relatedEntity: 'Invoice',
        relatedEntityId: invoice.id,
        templateKey: 'fee_overdue',
        context: {
          guardianName: guardian.guardianUser.name,
          studentName: studentName(guardian),
          invoiceNo: invoice.invoiceNo,
          balance: formatMoney(Number(invoice.balance), currency),
          dueDate: formatDate(invoice.dueDate),
          academyName: profile.name,
        },
        payload: { invoiceId: invoice.id, kind: 'overdue' },
      });

      if (result.created) queued += 1;
    }
  }

  return queued;
}

/**
 * Examination reminders, sent before an exam starts to the guardians of every
 * student enrolled in one of the exam's classes.
 */
async function queueExamReminders(now: Date): Promise<number> {
  const rules = await getNotificationRules();
  const profile = await getAcademyProfile();
  const reminderDays = rules.examReminderLeadDays;

  const horizon = new Date(now.getTime() + reminderDays * 86_400_000);

  const exams = await prisma.exam.findMany({
    where: {
      startDate: { gte: now, lte: horizon },
      resultStatus: { not: 'PUBLISHED' },
    },
    select: { id: true, name: true, startDate: true, classSectionIds: true },
  });

  let queued = 0;

  for (const exam of exams) {
    const enrollments = await prisma.enrollment.findMany({
      where: { classSectionId: { in: exam.classSectionIds }, status: 'ACTIVE' },
      select: { studentId: true },
    });

    const guardians = await guardiansForStudents(
      Array.from(new Set(enrollments.map((e) => e.studentId))),
    );

    for (const guardian of guardians) {
      const phone = guardianPhone(guardian);
      if (!phone) continue;

      const result = await enqueueNotification({
        category: NotificationCategory.EXAM_REMINDER,
        dedupeKey: dedupeKeys.examReminder(exam.id, guardian.studentId),
        recipientUserId: guardian.guardianUser.id,
        recipientPhone: phone,
        studentId: guardian.studentId,
        relatedEntity: 'Exam',
        relatedEntityId: exam.id,
        templateKey: 'exam_reminder',
        context: {
          guardianName: guardian.guardianUser.name,
          studentName: studentName(guardian),
          examName: exam.name,
          date: formatDate(exam.startDate),
          academyName: profile.name,
        },
        payload: { examId: exam.id },
      });

      if (result.created) queued += 1;
    }
  }

  return queued;
}

/** Nudge guardians about assignments whose deadline is within 24 hours. */
async function queueAssignmentDueReminders(now: Date): Promise<number> {
  const profile = await getAcademyProfile();

  const dueSoon = await prisma.assignment.findMany({
    where: {
      status: 'PUBLISHED',
      dueAt: { gte: now, lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
    },
    select: {
      id: true,
      title: true,
      dueAt: true,
      classSectionId: true,
      subject: { select: { name: true } },
    },
    take: 200,
  });

  let queued = 0;

  for (const assignment of dueSoon) {
    const enrollments = await prisma.enrollment.findMany({
      where: { classSectionId: assignment.classSectionId, status: 'ACTIVE' },
      select: { studentId: true },
    });

    const guardians = await guardiansForStudents(enrollments.map((e) => e.studentId));

    // Students who have already submitted do not need the nudge.
    const submitted = new Set(
      (
        await prisma.assignmentSubmission.findMany({
          where: {
            assignmentId: assignment.id,
            status: { not: 'NOT_SUBMITTED' },
          },
          select: { studentId: true },
        })
      ).map((s) => s.studentId),
    );

    for (const guardian of guardians) {
      const phone = guardianPhone(guardian);
      if (!phone) continue;
      if (submitted.has(guardian.studentId)) continue;

      const result = await enqueueNotification({
        category: NotificationCategory.ASSIGNMENT_DUE,
        dedupeKey: dedupeKeys.assignmentDue(assignment.id, guardian.studentId),
        recipientUserId: guardian.guardianUser.id,
        recipientPhone: phone,
        studentId: guardian.studentId,
        relatedEntity: 'Assignment',
        relatedEntityId: assignment.id,
        templateKey: 'assignment_due',
        context: {
          guardianName: guardian.guardianUser.name,
          studentName: studentName(guardian),
          assignmentTitle: assignment.title,
          subjectName: assignment.subject.name,
          deadline: formatDate(assignment.dueAt),
          academyName: profile.name,
        },
        payload: { assignmentId: assignment.id },
      });

      if (result.created) queued += 1;
    }
  }

  return queued;
}

/**
 * Run every scheduled reminder generator.
 *
 * Each generator is isolated so one failure cannot stop the others, and the
 * outcome is written to the system event log for operators.
 */
export async function runScheduledReminders(
  now = new Date(),
): Promise<ScheduledReminderResult> {
  const result: ScheduledReminderResult = {
    feeReminders: 0,
    examReminders: 0,
    assignmentDueReminders: 0,
  };

  const steps: Array<[keyof ScheduledReminderResult, () => Promise<number>]> = [
    ['feeReminders', () => queueFeeReminders(now)],
    ['examReminders', () => queueExamReminders(now)],
    ['assignmentDueReminders', () => queueAssignmentDueReminders(now)],
  ];

  for (const [key, run] of steps) {
    try {
      result[key] = await run();
    } catch (error) {
      console.error(`[scheduler] ${key} failed:`, error);
      await logEvent('scheduler', `Reminder generator failed: ${key}`, {
        level: 'ERROR',
        detail: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  return result;
}
