#!/usr/bin/env tsx
/**
 * Notification worker.
 *
 * Drains the durable NotificationJob outbox: renders each message, calls the
 * configured WhatsApp adapter, and records the provider response. Run it as a
 * long-lived process in production (`npm run worker`) or once per cron tick
 * with `npm run worker:once`.
 *
 *   tsx scripts/worker.ts                 # loop until interrupted
 *   tsx scripts/worker.ts --once          # drain a single batch and exit
 *   tsx scripts/worker.ts --batch-size 25
 *   tsx scripts/worker.ts --requeue       # also recover jobs orphaned by a crash
 */
import { runWorkerLoop, processQueue, requeueOrphanedJobs } from '../src/server/notifications/worker';
import { notificationQueueStats } from '../src/server/notifications/queue';
import { prisma } from '../src/lib/prisma';
import { whatsappStatus } from '../src/server/whatsapp/adapter';

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const once = process.argv.includes('--once');
  const batchSize = Number(argValue('--batch-size') ?? 20);
  const workerId = argValue('--worker-id') ?? `worker-${process.pid}`;

  const mode = whatsappStatus().mode;
  console.log(`[worker] starting as ${workerId} (batch ${batchSize}, adapter: ${mode})`);

  if (mode === 'mock') {
    console.log(
      '[worker] WhatsApp credentials are not configured, so the mock adapter is active. ' +
        'Messages are marked as simulated and are NOT delivered to real handsets.',
    );
  }

  if (process.argv.includes('--requeue')) {
    const recovered = await requeueOrphanedJobs();
    console.log(`[worker] recovered ${recovered} job(s) abandoned by a previous run`);
  }

  if (once) {
    const result = await processQueue({ batchSize, workerId, once: true });
    const stats = await notificationQueueStats();
    console.log(
      `[worker] processed ${result.processed} — sent ${result.sent}, failed ${result.failed}, ` +
        `retried ${result.retried}, skipped ${result.skipped}`,
    );
    console.log(`[worker] queue: ${JSON.stringify(stats)}`);
    return;
  }

  const controller = new AbortController();
  const stop = (signal: string) => {
    console.log(`[worker] ${signal} received, finishing the current batch…`);
    controller.abort();
  };

  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));

  await runWorkerLoop({ batchSize, workerId, signal: controller.signal });
  console.log('[worker] stopped');
}

main()
  .catch((error) => {
    console.error('[worker] fatal:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
