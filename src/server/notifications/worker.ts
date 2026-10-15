import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { logEvent } from '@/lib/audit';
import { getWhatsAppAdapter } from '@/server/whatsapp/adapter';
import { recordDelivery } from './queue';
import {
  NotificationCategory,
  NotificationChannel,
  NotificationStatus,
} from '@prisma/client';

export interface WorkerOptions {
  batchSize?: number;
  workerId?: string;
  /** Process at most one batch, then return. Used by tests and cron. */
  once?: boolean;
  signal?: AbortSignal;
}

export interface WorkerResult {
  processed: number;
  sent: number;
  failed: number;
  retried: number;
  skipped: number;
}

const WORKER_ID = `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Claim a batch of due jobs atomically.
 *
 * `FOR UPDATE SKIP LOCKED` lets several workers run side by side without ever
 * handing the same job to two of them. Jobs whose lock is older than the
 * timeout are reclaimable, so a crashed worker cannot strand a message.
 */
async function claimJobs(limit: number): Promise<string[]> {
  const staleLockCutoff = new Date(Date.now() - 5 * 60 * 1000);

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH claimed AS (
      SELECT id
      FROM "NotificationJob"
      WHERE (
              (status = 'QUEUED' AND "nextAttemptAt" <= NOW())
              OR (status = 'PROCESSING' AND "lockedAt" < ${staleLockCutoff})
            )
        AND "scheduledFor" <= NOW()
      ORDER BY "nextAttemptAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "NotificationJob" j
    SET status = 'PROCESSING',
        "lockedAt" = NOW(),
        "lockedBy" = ${WORKER_ID},
        "updatedAt" = NOW()
    FROM claimed
    WHERE j.id = claimed.id
    RETURNING j.id
  `;

  return rows.map((r) => r.id);
}

/**
 * Should this message wait for quiet hours to end?
 *
 * Quiet hours are evaluated in the academy timezone so a window expressed as
 * 21:00–07:00 behaves correctly regardless of where the server runs.
 */
export function inQuietHours(
  now: Date,
  timezone: string,
  start: string,
  end: string,
): boolean {
  const minutes = localMinutes(now, timezone);
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  // A window that crosses midnight wraps around.
  if (startMinutes <= endMinutes) {
    return minutes >= startMinutes && minutes < endMinutes;
  }
  return minutes >= startMinutes || minutes < endMinutes;
}

function localMinutes(date: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return hour * 60 + minute;
  } catch {
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
}

/** Next moment quiet hours end, so the job can be rescheduled precisely. */
function quietHoursEnd(now: Date, timezone: string, end: string): Date {
  const [endH, endM] = end.split(':').map(Number);
  const target = endH * 60 + endM;
  const current = localMinutes(now, timezone);

  let minutesAhead = target - current;
  if (minutesAhead <= 0) minutesAhead += 24 * 60;

  return new Date(now.getTime() + minutesAhead * 60 * 1000);
}

/** Exponential backoff with jitter: 1m, 4m, 9m, 16m … capped at 1 hour. */
export function backoffDelay(attempt: number): number {
  const base = Math.min(attempt * attempt, 60) * 60 * 1000;
  const jitter = Math.random() * 30_000;
  return base + jitter;
}

export async function processQueue(
  options: WorkerOptions = {},
): Promise<WorkerResult> {
  const batchSize = options.batchSize ?? env.WORKER_BATCH_SIZE;
  const result: WorkerResult = {
    processed: 0,
    sent: 0,
    failed: 0,
    retried: 0,
    skipped: 0,
  };

  const run = await prisma.backgroundJobRun.create({
    data: { jobName: 'notification-worker', status: 'RUNNING' },
  });

  try {
    const ids = await claimJobs(batchSize);
    if (ids.length === 0) {
      await prisma.backgroundJobRun.update({
        where: { id: run.id },
        data: { status: 'COMPLETED', finishedAt: new Date() },
      });
      return result;
    }

    const jobs = await prisma.notificationJob.findMany({
      where: { id: { in: ids } },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const adapter = getWhatsAppAdapter();

    for (const job of jobs) {
      result.processed += 1;

      try {
        // Re-check the recipient's preferences: they may have opted out or
        // been deactivated between queueing and sending.
        if (job.recipientUserId) {
          const pref = await prisma.notificationPreference.findUnique({
            where: {
              userId_channel_category: {
                userId: job.recipientUserId,
                channel: job.channel,
                category: job.category,
              },
            },
          });

          if (pref?.optedOut) {
            await prisma.notificationJob.update({
              where: { id: job.id },
              data: {
                status: NotificationStatus.SKIPPED_OPT_OUT,
                lockedAt: null,
                lockedBy: null,
                errorMessage: 'Recipient opted out before the message was sent.',
              },
            });
            result.skipped += 1;
            continue;
          }

          if (pref?.quietHoursStart != null && pref?.quietHoursEnd != null) {
            const quiet = inQuietHours(
              new Date(),
              pref.timezone,
              minutesToHHMM(pref.quietHoursStart),
              minutesToHHMM(pref.quietHoursEnd),
            );

            if (quiet && job.category !== NotificationCategory.ATTENDANCE_ABSENCE) {
              // Absence alerts are time-sensitive and bypass quiet hours.
              const resumeAt = quietHoursEnd(
                new Date(),
                pref.timezone,
                minutesToHHMM(pref.quietHoursEnd),
              );
              await prisma.notificationJob.update({
                where: { id: job.id },
                data: {
                  status: NotificationStatus.QUEUED,
                  lockedAt: null,
                  lockedBy: null,
                  nextAttemptAt: resumeAt,
                  errorMessage: 'Deferred until quiet hours end.',
                },
              });
              result.skipped += 1;
              continue;
            }
          }
        }

        if (!job.recipientPhone || job.recipientPhone.replace(/\D/g, '').length < 7) {
          await prisma.notificationJob.update({
            where: { id: job.id },
            data: {
              status: NotificationStatus.FAILED,
              lockedAt: null,
              lockedBy: null,
              errorMessage: 'Recipient phone number is missing or invalid.',
            },
          });
          await recordDelivery(job.id, {
            status: NotificationStatus.FAILED,
            isMock: false,
            recipient: job.recipientPhone || '(none)',
            channel: job.channel,
            category: job.category,
            error: 'Recipient phone number is missing or invalid.',
          });
          result.failed += 1;
          continue;
        }

        const outcome = await adapter.send({
          to: job.recipientPhone,
          body: job.body,
          templateName:
            (job.payload as { providerTemplateName?: string } | null)
              ?.providerTemplateName ?? null,
          templateLanguage: job.locale,
          clientReference: job.id,
        });

        if (outcome.ok) {
          await recordDelivery(job.id, {
            status: NotificationStatus.SENT,
            isMock: outcome.isMock,
            providerMessageId: outcome.providerMessageId ?? null,
            response: outcome.raw,
            recipient: job.recipientPhone,
            channel: job.channel,
            category: job.category,
          });
          result.sent += 1;
          continue;
        }

        const attempts = job.attempts + 1;
        const canRetry = outcome.retryable && attempts < job.maxAttempts;

        if (canRetry) {
          await prisma.notificationJob.update({
            where: { id: job.id },
            data: {
              status: NotificationStatus.QUEUED,
              attempts,
              lockedAt: null,
              lockedBy: null,
              nextAttemptAt: new Date(Date.now() + backoffDelay(attempts)),
              errorMessage: outcome.error ?? 'Delivery attempt failed.',
            },
          });
          result.retried += 1;
        } else {
          await recordDelivery(job.id, {
            status: NotificationStatus.FAILED,
            isMock: outcome.isMock,
            providerMessageId: null,
            response: outcome.raw,
            recipient: job.recipientPhone,
            channel: job.channel,
            category: job.category,
            error:
              outcome.error ??
              (outcome.retryable
                ? `Gave up after ${attempts} attempts.`
                : 'The provider rejected this message permanently.'),
          });
          await prisma.notificationJob.update({
            where: { id: job.id },
            data: { attempts, lockedAt: null, lockedBy: null },
          });
          result.failed += 1;
        }
      } catch (error) {
        // A single bad job must not stop the batch.
        const message = error instanceof Error ? error.message : String(error);
        await prisma.notificationJob.update({
          where: { id: job.id },
          data: {
            status: NotificationStatus.QUEUED,
            lockedAt: null,
            lockedBy: null,
            attempts: job.attempts + 1,
            nextAttemptAt: new Date(Date.now() + backoffDelay(job.attempts + 1)),
            errorMessage: `Worker error: ${message}`,
          },
        });
        result.retried += 1;
        await logEvent('notification-worker', 'Job threw during processing', {
          level: 'ERROR',
          detail: { jobId: job.id, message },
        });
      }
    }

    await prisma.backgroundJobRun.update({
      where: { id: run.id },
      data: {
        status: 'COMPLETED',
        finishedAt: new Date(),
        processed: result.processed,
        succeeded: result.sent,
        failed: result.failed,
        detail: result as unknown as object,
      },
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.backgroundJobRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        processed: result.processed,
        succeeded: result.sent,
        failed: result.failed,
        error: message,
      },
    });
    throw error;
  }
}

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Recover jobs that were left in PROCESSING by a worker that died. Called at
 * worker start-up so a restart does not silently drop in-flight messages.
 */
export async function requeueOrphanedJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000);
  const result = await prisma.notificationJob.updateMany({
    where: { status: NotificationStatus.PROCESSING, lockedAt: { lt: cutoff } },
    data: {
      status: NotificationStatus.QUEUED,
      lockedAt: null,
      lockedBy: null,
      nextAttemptAt: new Date(),
    },
  });
  return result.count;
}

/** Polling loop used by `npm run worker`. */
export async function runWorkerLoop(
  options: WorkerOptions = {},
): Promise<void> {
  const recovered = await requeueOrphanedJobs();
  if (recovered > 0) {
    console.log(`[worker] recovered ${recovered} orphaned job(s)`);
  }

  console.log(
    `[worker] started ${WORKER_ID} — polling every ${env.WORKER_POLL_INTERVAL_MS}ms`,
  );

  let running = true;
  const stop = () => {
    running = false;
    console.log('[worker] shutdown requested, finishing current batch…');
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  options.signal?.addEventListener('abort', stop);

  while (running) {
    try {
      const result = await processQueue(options);
      if (result.processed > 0) {
        console.log(
          `[worker] processed=${result.processed} sent=${result.sent} retried=${result.retried} failed=${result.failed} skipped=${result.skipped}`,
        );
      }
    } catch (error) {
      console.error('[worker] batch failed:', error);
    }

    if (options.once) return;

    await new Promise((resolve) =>
      setTimeout(resolve, env.WORKER_POLL_INTERVAL_MS),
    );
  }
}
