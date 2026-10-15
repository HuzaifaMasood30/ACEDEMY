import { prisma } from '@/lib/prisma';
import { logEvent } from '@/lib/audit';
import {
  NotificationCategory,
  NotificationChannel,
  NotificationStatus,
  type Prisma,
} from '@prisma/client';
import { renderTemplate, type TemplateContext } from './templates';
import { getNotificationRules } from '@/server/settings';
import { env } from '@/lib/env';

export interface EnqueueInput {
  category: NotificationCategory;
  channel?: NotificationChannel;
  /** Unique per intended message. Re-enqueuing the same key is a no-op. */
  dedupeKey: string;
  recipientUserId?: string | null;
  recipientPhone: string;
  studentId?: string | null;
  relatedEntity?: string | null;
  relatedEntityId?: string | null;
  templateKey?: string | null;
  locale?: string;
  context: TemplateContext;
  /** Extra data persisted for audit and debugging. */
  payload?: Record<string, unknown>;
  scheduledFor?: Date;
  createdByUserId?: string | null;
}

export interface EnqueueResult {
  created: boolean;
  jobId?: string;
  skippedReason?: 'duplicate' | 'opted_out' | 'disabled';
}

/**
 * Queue one notification.
 *
 * Idempotency is enforced by the unique index on `dedupeKey`, not by a
 * read-then-write check, so two concurrent callers cannot both insert. An
 * edited attendance record or a worker retry therefore never produces a second
 * message for the same underlying event.
 */
export async function enqueueNotification(
  input: EnqueueInput,
): Promise<EnqueueResult> {
  const channel = input.channel ?? NotificationChannel.WHATSAPP;
  const locale = input.locale ?? env.WHATSAPP_DEFAULT_LOCALE;

  const rules = await getNotificationRules();

  // Category-level kill switch configured by the academy.
  const categoryEnabled =
    input.category === NotificationCategory.ATTENDANCE_ABSENCE
      ? rules.absenceNotificationsEnabled
      : input.category === NotificationCategory.RESULT_PUBLISHED
        ? rules.resultNotificationsEnabled
        : input.category === NotificationCategory.FEE_REMINDER ||
            input.category === NotificationCategory.FEE_OVERDUE
          ? rules.feeReminderEnabled
          : input.category === NotificationCategory.EXAM_REMINDER
            ? rules.examReminderEnabled
            : true;

  if (!categoryEnabled) {
    return { created: false, skippedReason: 'disabled' };
  }

  // Respect an explicit opt-out by the guardian before the row is created.
  if (input.recipientUserId) {
    const pref = await prisma.notificationPreference.findUnique({
      where: {
        userId_channel_category: {
          userId: input.recipientUserId,
          channel,
          category: input.category,
        },
      },
    });

    if (pref?.optedOut) {
      await prisma.notificationLog.create({
        data: {
          channel,
          category: input.category,
          recipient: input.recipientPhone,
          status: NotificationStatus.SKIPPED_OPT_OUT,
          errorMessage: 'Recipient has opted out of this notification category.',
        },
      });
      return { created: false, skippedReason: 'opted_out' };
    }
  }

  const body = renderTemplate(input.templateKey, input.context, locale);

  try {
    const job = await prisma.notificationJob.create({
      data: {
        dedupeKey: input.dedupeKey,
        channel,
        category: input.category,
        status: NotificationStatus.QUEUED,
        recipientUserId: input.recipientUserId ?? null,
        recipientPhone: input.recipientPhone,
        studentId: input.studentId ?? null,
        relatedEntity: input.relatedEntity ?? null,
        relatedEntityId: input.relatedEntityId ?? null,
        templateKey: input.templateKey ?? null,
        locale,
        body,
        payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
        scheduledFor: input.scheduledFor ?? new Date(),
        nextAttemptAt: input.scheduledFor ?? new Date(),
        maxAttempts: env.WORKER_MAX_ATTEMPTS,
        createdByUserId: input.createdByUserId ?? null,
      },
      select: { id: true },
    });

    return { created: true, jobId: job.id };
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Already queued for this exact event. Record the fact and move on.
      await prisma.notificationLog.create({
        data: {
          channel,
          category: input.category,
          recipient: input.recipientPhone,
          status: NotificationStatus.SKIPPED_DUPLICATE,
          errorMessage: `A message for this event was already queued (${input.dedupeKey}).`,
        },
      });
      return { created: false, skippedReason: 'duplicate' };
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

/** Deterministic dedupe keys. One helper per event class keeps them consistent. */
export const dedupeKeys = {
  /**
   * Keyed on the session, student and recipient rather than the attendance
   * record id.
   *
   * Re-saving a register replaces its records wholesale, so record ids are
   * ephemeral: keying on one would send a fresh alert every time a teacher
   * corrected the register, or toggled a student absent → present → absent.
   * The session identifies one class, date and period, which is the event a
   * guardian should hear about exactly once — but each guardian is a separate
   * recipient and must receive their own message.
   */
  attendanceAbsence: (attendanceSessionId: string, studentId: string, recipientId: string) =>
    `attendance:absence:${attendanceSessionId}:${studentId}:${recipientId}`,
  attendanceLate: (attendanceSessionId: string, studentId: string, recipientId: string) =>
    `attendance:late:${attendanceSessionId}:${studentId}:${recipientId}`,
  invoiceReminder: (invoiceId: string, offsetDays: number) =>
    `fee:reminder:${invoiceId}:${offsetDays}`,
  invoiceOverdue: (invoiceId: string, dayBucket: string) =>
    `fee:overdue:${invoiceId}:${dayBucket}`,
  resultPublished: (examId: string, studentId: string) =>
    `result:published:${examId}:${studentId}`,
  examReminder: (examId: string, studentId: string) =>
    `exam:reminder:${examId}:${studentId}`,
  timetableChange: (slotId: string, changeStamp: string) =>
    `timetable:change:${slotId}:${changeStamp}`,
  assignmentNew: (assignmentId: string, studentId: string) =>
    `assignment:new:${assignmentId}:${studentId}`,
  assignmentDue: (assignmentId: string, studentId: string) =>
    `assignment:due:${assignmentId}:${studentId}`,
  announcement: (announcementId: string, recipientKey: string) =>
    `announcement:${announcementId}:${recipientKey}`,
  admissionUpdate: (applicationId: string, status: string) =>
    `admission:${applicationId}:${status}`,
  manual: (batchId: string, recipientKey: string) =>
    `manual:${batchId}:${recipientKey}`,
} as const;

/** Record a delivery attempt outcome. Called by the worker only. */
export async function recordDelivery(
  jobId: string,
  outcome: {
    status: NotificationStatus;
    isMock: boolean;
    providerMessageId?: string | null;
    response?: unknown;
    error?: string | null;
    recipient: string;
    channel: NotificationChannel;
    category: NotificationCategory;
  },
): Promise<void> {
  await prisma.$transaction([
    prisma.notificationJob.update({
      where: { id: jobId },
      data: {
        status: outcome.status,
        providerMessageId: outcome.providerMessageId ?? null,
        providerResponse: (outcome.response ?? undefined) as Prisma.InputJsonValue | undefined,
        errorMessage: outcome.error ?? null,
        sentAt: outcome.status === NotificationStatus.SENT ? new Date() : undefined,
        lockedAt: null,
        lockedBy: null,
      },
    }),
    prisma.notificationLog.create({
      data: {
        jobId,
        channel: outcome.channel,
        category: outcome.category,
        recipient: outcome.recipient,
        status: outcome.status,
        isMock: outcome.isMock,
        providerMessageId: outcome.providerMessageId ?? null,
        response: (outcome.response ?? undefined) as Prisma.InputJsonValue | undefined,
        errorMessage: outcome.error ?? null,
      },
    }),
  ]);

  if (outcome.status === NotificationStatus.FAILED) {
    await logEvent('notification', 'Message delivery failed', {
      level: 'WARN',
      detail: {
        jobId,
        recipient: outcome.recipient,
        category: outcome.category,
        error: outcome.error,
      },
    });
  }
}

/** Notification log with filters, used by the admin delivery screen. */
export async function listNotificationLogs(options: {
  page: number;
  pageSize: number;
  status?: NotificationStatus;
  channel?: NotificationChannel;
  category?: NotificationCategory;
  search?: string;
}) {
  const where: Prisma.NotificationLogWhereInput = {
    ...(options.status ? { status: options.status } : {}),
    ...(options.channel ? { channel: options.channel } : {}),
    ...(options.category ? { category: options.category } : {}),
    ...(options.search
      ? { recipient: { contains: options.search, mode: 'insensitive' as const } }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.notificationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
    prisma.notificationLog.count({ where }),
  ]);

  return { rows, total };
}

/** Queue statistics for the admin dashboard. */
export async function notificationQueueStats() {
  const [byStatus, last24h, mockCount] = await Promise.all([
    prisma.notificationJob.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.notificationLog.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
    prisma.notificationLog.count({
      where: {
        isMock: true,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  const counts = Object.fromEntries(
    byStatus.map((row) => [row.status, row._count._all]),
  ) as Record<string, number>;

  return {
    queued: counts[NotificationStatus.QUEUED] ?? 0,
    processing: counts[NotificationStatus.PROCESSING] ?? 0,
    sent: counts[NotificationStatus.SENT] ?? 0,
    delivered: counts[NotificationStatus.DELIVERED] ?? 0,
    failed: counts[NotificationStatus.FAILED] ?? 0,
    last24hTotal: last24h,
    last24hSimulated: mockCount,
  };
}
