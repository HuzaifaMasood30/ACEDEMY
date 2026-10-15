#!/usr/bin/env tsx
/**
 * Scheduler.
 *
 * Runs the recurring housekeeping the academy depends on: overdue fee
 * detection, fee reminders, exam reminders, low-attendance alert refresh,
 * orphaned notification recovery and rate-limit counter pruning.
 *
 * Intended to run once per hour from cron:
 *   0 * * * *  cd /srv/academy && npm run scheduler
 */
import { prisma } from '../src/lib/prisma';
import { refreshOverdueInvoices } from '../src/server/services/fees';
import { refreshStudentAlerts } from '../src/server/services/progress';
import { requeueOrphanedJobs } from '../src/server/notifications/worker';
import { pruneRateLimitBuckets } from '../src/lib/rate-limit';
import { runScheduledReminders } from '../src/server/notifications/scheduler';
import { logEvent } from '../src/lib/audit';

interface StepResult {
  step: string;
  ok: boolean;
  detail: string;
}

async function runStep(step: string, fn: () => Promise<string>): Promise<StepResult> {
  const started = Date.now();
  try {
    const detail = await fn();
    console.log(`[scheduler] ${step}: ${detail} (${Date.now() - started}ms)`);
    return { step, ok: true, detail };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[scheduler] ${step} FAILED: ${detail}`);
    return { step, ok: false, detail };
  }
}

async function main() {
  console.log(`[scheduler] run started at ${new Date().toISOString()}`);

  const results: StepResult[] = [];

  results.push(
    await runStep('requeue-orphaned-jobs', async () => {
      const count = await requeueOrphanedJobs();
      return `${count} job(s) recovered`;
    }),
  );

  results.push(
    await runStep('refresh-overdue-invoices', async () => {
      const count = await refreshOverdueInvoices();
      return `${count} invoice(s) moved to overdue`;
    }),
  );

  results.push(
    await runStep('refresh-student-alerts', async () => {
      const result = await refreshStudentAlerts({});
      return `${result.created} alert(s) created across ${result.evaluated} student(s)`;
    }),
  );

  results.push(
    await runStep('scheduled-reminders', async () => {
      const result = await runScheduledReminders();
      return `${result.feeReminders} fee reminder(s), ${result.examReminders} exam reminder(s) queued`;
    }),
  );

  results.push(
    await runStep('prune-rate-limits', async () => {
      const count = await pruneRateLimitBuckets(120);
      return `${count} expired counter(s) removed`;
    }),
  );

  const failed = results.filter((r) => !r.ok);

  await logEvent('scheduler', 'Scheduled run completed', {
    level: failed.length > 0 ? 'WARN' : 'INFO',
    detail: { results, failed: failed.map((f) => f.step) },
  });

  console.log(
    `[scheduler] finished: ${results.length - failed.length}/${results.length} step(s) succeeded`,
  );

  if (failed.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('[scheduler] fatal:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
