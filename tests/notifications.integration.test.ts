import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient, NotificationCategory } from '@prisma/client';
import { enqueueNotification, dedupeKeys } from '@/server/notifications/queue';

/**
 * Duplicate absence alerts are the most likely way to annoy a parent, so the
 * queue's dedupe guarantee is tested against the real unique constraint rather
 * than a stub.
 */

const prisma = new PrismaClient();
const PREFIX = 'VITEST-NOTIFY-';
const createdJobIds: string[] = [];
const createdLogIds: string[] = [];

afterAll(async () => {
  await prisma.notificationJob.deleteMany({ where: { dedupeKey: { startsWith: PREFIX } } });
  await prisma.notificationLog.deleteMany({
    where: { errorMessage: { contains: PREFIX } },
  });
  await prisma.$disconnect();
});

function baseInput(dedupeKey: string) {
  return {
    category: NotificationCategory.ATTENDANCE_ABSENCE,
    dedupeKey,
    recipientPhone: '+920000000000',
    templateKey: 'absence_alert',
    context: {
      guardianName: 'Test Guardian',
      studentName: 'Test Student',
      className: 'Grade 9 — A',
      date: '2026-01-15',
      academyName: 'Al-Noor Academy',
    },
  };
}

describe('notification dedupe', () => {
  it('queues the first message for an event', async () => {
    const key = `${PREFIX}first-${Date.now()}`;
    const result = await enqueueNotification(baseInput(key));
    expect(result.created).toBe(true);
    if (result.created && result.jobId) createdJobIds.push(result.jobId);
  });

  it('refuses a second message for the same event', async () => {
    const key = `${PREFIX}dup-${Date.now()}`;

    const first = await enqueueNotification(baseInput(key));
    expect(first.created).toBe(true);
    if (first.created && first.jobId) createdJobIds.push(first.jobId);

    const second = await enqueueNotification(baseInput(key));
    expect(second.created).toBe(false);
    expect(second.created === false && second.skippedReason).toBe('duplicate');
  });

  it('still refuses a duplicate when it arrives concurrently', async () => {
    // Two workers racing on the same absence must produce exactly one message.
    const key = `${PREFIX}race-${Date.now()}`;
    const results = await Promise.allSettled([
      enqueueNotification(baseInput(key)),
      enqueueNotification(baseInput(key)),
      enqueueNotification(baseInput(key)),
    ]);

    const created = results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<{ created: boolean }>).value)
      .filter((r) => r.created);

    expect(created.length).toBe(1);

    const rows = await prisma.notificationJob.count({ where: { dedupeKey: key } });
    expect(rows).toBe(1);
  });

  it('treats a different event as a new message', async () => {
    const a = await enqueueNotification(baseInput(`${PREFIX}a-${Date.now()}`));
    const b = await enqueueNotification(baseInput(`${PREFIX}b-${Date.now()}`));
    expect(a.created).toBe(true);
    expect(b.created).toBe(true);
    if (a.created && a.jobId) createdJobIds.push(a.jobId);
    if (b.created && b.jobId) createdJobIds.push(b.jobId);
  });

  it('records the skipped duplicate in the notification log', async () => {
    const key = `${PREFIX}log-${Date.now()}`;
    const first = await enqueueNotification(baseInput(key));
    if (first.created && first.jobId) createdJobIds.push(first.jobId);
    await enqueueNotification(baseInput(key));

    const logged = await prisma.notificationLog.findFirst({
      where: {
        status: 'SKIPPED_DUPLICATE',
        errorMessage: { contains: key },
      },
    });
    expect(logged).not.toBeNull();
    if (logged) createdLogIds.push(logged.id);
  });

  it('renders the academy name into the message body', async () => {
    const key = `${PREFIX}body-${Date.now()}`;
    const result = await enqueueNotification(baseInput(key));
    expect(result.created).toBe(true);
    if (!result.created) return;

    const job = await prisma.notificationJob.findUniqueOrThrow({
      where: { id: result.jobId },
      select: { body: true, status: true },
    });
    expect(job.body).toContain('Al-Noor Academy');
    expect(job.body).toContain('Test Student');
    // A queued job has not been sent: the provider has not confirmed anything.
    expect(job.status).toBe('QUEUED');
  });
});

describe('dedupe keys', () => {
  it('are deterministic for the same event', () => {
    expect(dedupeKeys.attendanceAbsence('s1', 'stu1', 'g1')).toBe(
      dedupeKeys.attendanceAbsence('s1', 'stu1', 'g1'),
    );
  });

  it('separate different students in the same session', () => {
    expect(dedupeKeys.attendanceAbsence('s1', 'stu1', 'g1')).not.toBe(
      dedupeKeys.attendanceAbsence('s1', 'stu2', 'g1'),
    );
  });

  it('separate different guardians of the same student', () => {
    // A mother and a father must each receive their own absence alert.
    expect(dedupeKeys.attendanceAbsence('s1', 'stu1', 'g1')).not.toBe(
      dedupeKeys.attendanceAbsence('s1', 'stu1', 'g2'),
    );
  });

  it('separate the same student across different sessions', () => {
    expect(dedupeKeys.attendanceAbsence('s1', 'stu1', 'g1')).not.toBe(
      dedupeKeys.attendanceAbsence('s2', 'stu1', 'g1'),
    );
  });

  it('keep reminder offsets distinct', () => {
    const base = dedupeKeys.invoiceReminder('inv1', -7);
    expect(base).not.toBe(dedupeKeys.invoiceReminder('inv1', -3));
    expect(base).not.toBe(dedupeKeys.invoiceReminder('inv2', -7));
  });

  it('separate results per student', () => {
    expect(dedupeKeys.resultPublished('exam1', 'stu1')).not.toBe(
      dedupeKeys.resultPublished('exam1', 'stu2'),
    );
  });
});
