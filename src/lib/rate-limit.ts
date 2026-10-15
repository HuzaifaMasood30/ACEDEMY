import { prisma } from './prisma';
import { rateLimited } from './errors';

/**
 * Fixed-window rate limiter backed by Postgres.
 *
 * A single-process in-memory limiter would reset on every deploy and would not
 * hold across multiple app instances, so the counter lives in the database.
 * `SystemEvent` is reused as the counter store to avoid a table that exists
 * only for rate limiting; entries are keyed by bucket name and window start.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export async function checkRateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const key = `ratelimit:${bucket}:${windowStart.getTime()}`;

  const existing = await prisma.systemEvent.findFirst({
    where: { source: 'ratelimit', message: key },
    select: { id: true, detail: true },
  });

  const currentCount =
    existing && existing.detail && typeof existing.detail === 'object'
      ? Number((existing.detail as Record<string, unknown>).count ?? 0)
      : 0;

  const resetAt = new Date(windowStart.getTime() + windowMs);

  if (currentCount >= limit) {
    return { allowed: false, remaining: 0, resetAt };
  }

  if (existing) {
    await prisma.systemEvent.update({
      where: { id: existing.id },
      data: { detail: { count: currentCount + 1 } },
    });
  } else {
    await prisma.systemEvent.create({
      data: {
        level: 'DEBUG',
        source: 'ratelimit',
        message: key,
        detail: { count: 1 },
      },
    });
  }

  return { allowed: true, remaining: Math.max(0, limit - currentCount - 1), resetAt };
}

export async function enforceRateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const result = await checkRateLimit(bucket, limit, windowSeconds);
  if (!result.allowed) {
    throw rateLimited(
      `Too many requests. Please wait until ${result.resetAt.toISOString()} before trying again.`,
    );
  }
}

/** Remove expired counters. Called by the background scheduler. */
export async function pruneRateLimitBuckets(olderThanMinutes = 60): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  const result = await prisma.systemEvent.deleteMany({
    where: { source: 'ratelimit', createdAt: { lt: cutoff } },
  });
  return result.count;
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}
