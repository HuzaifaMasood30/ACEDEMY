import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export interface AuditInput {
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Redact anything that must never be written to an audit row in clear text.
 * Audit tables are readable by administrators, so credentials and payment
 * secrets are stripped before persistence rather than filtered at read time.
 */
const REDACTED_KEYS = [
  'password',
  'passwordhash',
  'password_hash',
  'newpassword',
  'currentpassword',
  'token',
  'tokenhash',
  'sessiontoken',
  'accesstoken',
  'refreshtoken',
  'mfasecret',
  'cardnumber',
  'cvv',
  'secret',
  'apikey',
  'api_key',
];

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[deep]';
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (REDACTED_KEYS.includes(key.toLowerCase())) {
        out[key] = '[redacted]';
      } else {
        out[key] = redact(val, depth + 1);
      }
    }
    return out;
  }
  return value;
}

/** Write an audit entry. Never throws — a failed audit write must not fail the request. */
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        actorEmail: input.actorEmail ?? null,
        actorRole: (input.actorRole as never) ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        before: input.before === undefined ? undefined : (redact(input.before) as Prisma.InputJsonValue),
        after: input.after === undefined ? undefined : (redact(input.after) as Prisma.InputJsonValue),
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (error) {
    console.error('[audit] failed to persist audit entry', {
      action: input.action,
      entity: input.entity,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Record an operational event for the system-health view. */
export async function logEvent(
  source: string,
  message: string,
  options: { level?: 'INFO' | 'WARN' | 'ERROR'; detail?: unknown } = {},
): Promise<void> {
  try {
    await prisma.systemEvent.create({
      data: {
        level: options.level ?? 'INFO',
        source,
        message,
        detail: options.detail === undefined ? undefined : (redact(options.detail) as Prisma.InputJsonValue),
      },
    });
  } catch (error) {
    console.error('[event] failed to persist system event', {
      source,
      message,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Field-level diff used to store compact, meaningful `before`/`after` payloads. */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): { before: Partial<T>; after: Partial<T> } | null {
  const changedBefore: Partial<T> = {};
  const changedAfter: Partial<T> = {};

  for (const key of Object.keys(after) as (keyof T)[]) {
    const next = after[key];
    const prev = before[key];
    const same =
      next instanceof Date && prev instanceof Date
        ? next.getTime() === prev.getTime()
        : next === prev;

    if (!same) {
      changedBefore[key] = prev;
      changedAfter[key] = next as T[keyof T];
    }
  }

  if (Object.keys(changedAfter).length === 0) return null;
  return { before: changedBefore, after: changedAfter };
}
