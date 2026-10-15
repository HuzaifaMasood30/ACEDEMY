import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, guard, body, limit } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { academyConfig } from '@/lib/config';
import { writeAudit } from '@/lib/audit';
import { whatsappStatus } from '@/server/whatsapp/adapter';
import { notificationQueueStats } from '@/server/notifications/queue';
import { requeueOrphanedJobs, processQueue } from '@/server/notifications/worker';
import { runScheduledReminders } from '@/server/notifications/scheduler';
import { refreshOverdueInvoices } from '@/server/services/fees';
import { listSettings } from '@/server/settings';

/**
 * System health.
 *
 * Reports reachability and configuration state, never credentials. A failing
 * dependency is reported as a degraded check rather than a thrown error, so the
 * screen still renders when the database is the thing that is broken.
 */
export async function GET() {
  try {
    await guard(PERMISSIONS.SYSTEM_BACKUP);

    const startedAt = Date.now();

    let database: { ok: boolean; latencyMs: number | null; error?: string } = {
      ok: false,
      latencyMs: null,
    };

    try {
      await prisma.$queryRaw`SELECT 1`;
      database = { ok: true, latencyMs: Date.now() - startedAt };
    } catch (error) {
      database = {
        ok: false,
        latencyMs: null,
        error: error instanceof Error ? error.message : 'Unknown database error',
      };
    }

    const [queue, counts, lastRuns, settings, failedJobs] = await Promise.all([
      notificationQueueStats().catch(() => null),
      prisma.$transaction([
        prisma.student.count(),
        prisma.user.count(),
        prisma.invoice.count(),
        prisma.payment.count(),
        prisma.attendanceRecord.count(),
        prisma.examResult.count(),
      ]).catch(() => null),
      prisma.backgroundJobRun
        .findMany({ orderBy: { startedAt: 'desc' }, take: 10 })
        .catch(() => []),
      listSettings().catch(() => []),
      prisma.notificationJob
        .findMany({
          where: { status: 'FAILED' },
          orderBy: { updatedAt: 'desc' },
          take: 10,
          select: {
            id: true,
            category: true,
            recipientPhone: true,
            attempts: true,
            maxAttempts: true,
            errorMessage: true,
            updatedAt: true,
          },
        })
        .catch(() => []),
    ]);

    const storageMode = env.STORAGE_DRIVER;
    const storageWritable =
      storageMode === 'local' ? env.STORAGE_LOCAL_DIR.length > 0 : env.S3_BUCKET.length > 0;

    return NextResponse.json({
      data: {
        application: {
          name: academyConfig.name,
          environment: env.NODE_ENV,
          timezone: academyConfig.timezone,
          currency: academyConfig.currency,
          uptimeSeconds: Math.round(process.uptime()),
          nodeVersion: process.version,
        },
        checks: {
          database,
          notificationWorker: {
            ok: queue !== null,
            queued: queue?.queued ?? 0,
            failed: queue?.failed ?? 0,
            last24h: queue?.last24hTotal ?? 0,
            simulatedLast24h: queue?.last24hSimulated ?? 0,
          },
          whatsapp: whatsappStatus(),
          storage: { driver: storageMode, configured: storageWritable },
          settingsLoaded: settings.length,
        },
        counts: counts
          ? {
              students: counts[0],
              users: counts[1],
              invoices: counts[2],
              payments: counts[3],
              attendanceRecords: counts[4],
              examResults: counts[5],
            }
          : null,
        recentJobRuns: lastRuns,
        failedNotifications: failedJobs,
      },
    });
  } catch (error) {
    return fail(error, 'system health');
  }
}

/**
 * Operational maintenance actions.
 *
 * Each of these is a real, audited trigger for work that otherwise only runs
 * from cron: draining the notification queue, generating the scheduled
 * reminders, refreshing overdue invoice status, and recovering jobs orphaned by
 * a worker crash.
 */
export async function POST(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.SYSTEM_BACKUP);
    await limit(request, 'system:maintenance', 20, 60);

    const payload = await body(
      request,
      z.object({
        action: z
          .enum(['requeueOrphaned', 'runWorker', 'runScheduler', 'refreshOverdue'])
          .default('requeueOrphaned'),
        batchSize: z.coerce.number().int().min(1).max(500).default(50),
      }),
    );

    let result: object;

    if (payload.action === 'runWorker') {
      result = await processQueue({ batchSize: payload.batchSize });
    } else if (payload.action === 'runScheduler') {
      result = await runScheduledReminders();
    } else if (payload.action === 'refreshOverdue') {
      result = { markedOverdue: await refreshOverdueInvoices() };
    } else {
      result = { recovered: await requeueOrphanedJobs() };
    }

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: `system.${payload.action}`,
      entity: 'SystemMaintenance',
      after: { action: payload.action, result },
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return fail(error, 'system maintenance');
  }
}
