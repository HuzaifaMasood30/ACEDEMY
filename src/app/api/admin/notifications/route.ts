import { z } from 'zod';
import { NextResponse } from 'next/server';
import { fail, guard, limit, body, parseListQuery, listResponse } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { writeAudit } from '@/lib/audit';
import {
  listNotificationLogs,
  notificationQueueStats,
  enqueueNotification,
} from '@/server/notifications/queue';
import { processQueue, requeueOrphanedJobs } from '@/server/notifications/worker';
import { whatsappStatus } from '@/server/whatsapp/adapter';
import { getAcademyProfile } from '@/server/settings';
import {
  NotificationChannel,
  NotificationStatus,
  NotificationCategory,
  Prisma,
} from '@prisma/client';

const manualSchema = z.object({
  /** Exactly one of `studentIds` or `phoneNumbers` must be supplied. */
  studentIds: z.array(z.string().min(1)).max(500).default([]),
  phoneNumbers: z.array(z.string().trim().min(7).max(20)).max(500).default([]),
  category: z.enum([
    'ABSENCE_ALERT',
    'FEE_REMINDER',
    'FEE_OVERDUE',
    'EXAM_REMINDER',
    'RESULT_PUBLISHED',
    'TIMETABLE_CHANGE',
    'ASSIGNMENT_NEW',
    'ANNOUNCEMENT',
    'ADMISSION_UPDATE',
    'GENERAL',
  ]),
  message: z.string().trim().min(3, 'Write the message.').max(1000),
  templateKey: z.string().trim().max(60).default('manual_message'),
});

/**
 * Notification queue, delivery logs and WhatsApp configuration status.
 *
 * The configuration status never includes token values — only whether each
 * credential is present — so the screen is safe for a non-technical operator.
 */
export async function GET(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.NOTIFICATION_VIEW_LOGS);
    const query = parseListQuery(request);
    const scope = query.params.get('scope') ?? 'logs';

    if (scope === 'status') {
      const profile = await getAcademyProfile();
      return NextResponse.json({
        data: {
          whatsapp: whatsappStatus(),
          queue: await notificationQueueStats(),
          academy: { name: profile.name },
        },
      });
    }

    if (scope === 'jobs') {
      const status = query.params.get('status');
      const where: Prisma.NotificationJobWhereInput = {
        ...(status ? { status: status as NotificationStatus } : {}),
        ...(query.params.get('category')
          ? { category: query.params.get('category') as NotificationCategory }
          : {}),
        ...(query.params.get('channel')
          ? { channel: query.params.get('channel') as NotificationChannel }
          : {}),
        ...(query.search
          ? {
              OR: [
                { recipientPhone: { contains: query.search } },
                { templateKey: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      };

      const [rows, total, stats] = await Promise.all([
        prisma.notificationJob.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: query.skip,
          take: query.take,
          select: {
            id: true,
            category: true,
            channel: true,
            status: true,
            recipientPhone: true,
            templateKey: true,
            attempts: true,
            maxAttempts: true,
            errorMessage: true,
            scheduledFor: true,
            sentAt: true,
            createdAt: true,
            student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
          },
        }),
        prisma.notificationJob.count({ where }),
        notificationQueueStats(),
      ]);

      return listResponse(rows, total, Object.assign(query, { stats }) as typeof query);
    }

    const status = query.params.get('status');
    const channel = query.params.get('channel');
    const category = query.params.get('category');

    const { rows, total } = await listNotificationLogs({
      page: query.page,
      pageSize: query.pageSize,
      status: status ? (status as NotificationStatus) : undefined,
      channel: channel ? (channel as NotificationChannel) : undefined,
      category: category ? (category as NotificationCategory) : undefined,
      search: query.search || undefined,
    });

    return listResponse(rows, total, query);
  } catch (error) {
    return fail(error, 'notifications GET');
  }
}

/**
 * Send a manual message to selected students' guardians or to raw numbers.
 *
 * Bulk sends are capped and deduplicated by the queue, so a double submit does
 * not message anyone twice.
 */
export async function POST(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.MESSAGE_SEND);
    await limit(request, 'notifications:manual', 20, 60);

    const payload = await body(request, manualSchema);

    if (payload.studentIds.length === 0 && payload.phoneNumbers.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message: 'Choose at least one student or enter at least one number.',
          },
        },
        { status: 422 },
      );
    }

    const profile = await getAcademyProfile();

    // Resolve student recipients to their authorized guardians.
    const guardians =
      payload.studentIds.length > 0
        ? await prisma.guardianLink.findMany({
            where: {
              studentId: { in: payload.studentIds },
              isAuthorized: true,
              receivesNotifications: true,
            },
            select: {
              studentId: true,
              contactPhone: true,
              guardianUser: { select: { id: true, name: true, phone: true } },
            },
          })
        : [];

    const batchId = `manual-${Date.now()}-${actor.id.slice(0, 6)}`;
    let queued = 0;
    let skipped = 0;

    for (const guardian of guardians) {
      const phone = guardian.contactPhone ?? guardian.guardianUser.phone;
      if (!phone) {
        skipped += 1;
        continue;
      }

      const result = await enqueueNotification({
        category: payload.category as NotificationCategory,
        dedupeKey: `manual:${batchId}:${guardian.guardianUser.id}:${guardian.studentId}`,
        recipientUserId: guardian.guardianUser.id,
        recipientPhone: phone,
        studentId: guardian.studentId,
        templateKey: payload.templateKey,
        context: {
          guardianName: guardian.guardianUser.name,
          body: payload.message,
          academyName: profile.name,
        },
        payload: { manual: true, batchId },
        createdByUserId: actor.id,
      });

      if (result.created) queued += 1;
      else skipped += 1;
    }

    for (const phone of payload.phoneNumbers) {
      const result = await enqueueNotification({
        category: payload.category as NotificationCategory,
        dedupeKey: `manual:${batchId}:phone:${phone}`,
        recipientPhone: phone,
        templateKey: payload.templateKey,
        context: { body: payload.message, academyName: profile.name },
        payload: { manual: true, batchId },
        createdByUserId: actor.id,
      });

      if (result.created) queued += 1;
      else skipped += 1;
    }

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'notification.manual_send',
      entity: 'NotificationJob',
      after: {
        category: payload.category,
        students: payload.studentIds.length,
        numbers: payload.phoneNumbers.length,
        queued,
        skipped,
      },
    });

    return NextResponse.json({ data: { batchId, queued, skipped } }, { status: 201 });
  } catch (error) {
    return fail(error, 'notifications manual send');
  }
}

/** Retry a failed job, or drain the queue now. */
export async function PUT(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.NOTIFICATION_MANAGE);
    await limit(request, 'notifications:manage', 30, 60);

    const payload = await body(
      request,
      z.discriminatedUnion('action', [
        z.object({ action: z.literal('retry'), jobId: z.string().min(1) }),
        z.object({ action: z.literal('drain'), batchSize: z.coerce.number().int().min(1).max(500).default(50) }),
        z.object({ action: z.literal('requeueOrphaned') }),
      ]),
    );

    if (payload.action === 'retry') {
      const job = await prisma.notificationJob.findUnique({ where: { id: payload.jobId } });

      if (!job) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Notification job not found.' } },
          { status: 404 },
        );
      }

      if (job.status !== NotificationStatus.FAILED) {
        return NextResponse.json(
          {
            error: {
              code: 'CONFLICT',
              message: 'Only a failed message can be retried.',
            },
          },
          { status: 409 },
        );
      }

      // Reset attempts so the retry is not immediately rejected by the cap.
      await prisma.notificationJob.update({
        where: { id: job.id },
        data: {
          status: NotificationStatus.QUEUED,
          attempts: 0,
          errorMessage: null,
          scheduledFor: new Date(),
          nextAttemptAt: new Date(),
        },
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'notification.retry',
        entity: 'NotificationJob',
        entityId: job.id,
      });

      return NextResponse.json({ data: { requeued: 1 } });
    }

    if (payload.action === 'requeueOrphaned') {
      const recovered = await requeueOrphanedJobs();
      return NextResponse.json({ data: { recovered } });
    }

    const result = await processQueue({ batchSize: payload.batchSize });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'notification.drain',
      entity: 'NotificationJob',
      after: result,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return fail(error, 'notifications manage');
  }
}
