import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge conditional class names, letting later Tailwind utilities win. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  PKR: 'Rs',
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
  AED: 'AED',
  SAR: 'SAR',
};

export function formatMoney(
  amount: number | string | { toString(): string },
  currency = 'PKR',
  options: { compact?: boolean } = {},
): string {
  const value = typeof amount === 'number' ? amount : Number(amount.toString());

  if (!Number.isFinite(value)) return `${CURRENCY_SYMBOLS[currency] ?? currency} 0`;

  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: options.compact ? 0 : 2,
    maximumFractionDigits: options.compact ? 1 : 2,
    notation: options.compact && Math.abs(value) >= 100_000 ? 'compact' : 'standard',
  }).format(value);

  const symbol = CURRENCY_SYMBOLS[currency];
  return symbol ? `${symbol} ${formatted}` : `${formatted} ${currency}`;
}

/** Percentages shown in tables always carry one decimal so columns align. */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

/** Thousands-separated integer, used on dashboards and reports. */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US').format(value);
}

/**
 * Short relative time for activity feeds.
 *
 * Falls back to an absolute date beyond a week, because "3 weeks ago" is less
 * useful than the actual date in an audit context.
 */
export function formatRelativeTime(value: Date | string | null | undefined): string {
  if (!value) return '—';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (Math.abs(seconds) < 45) return 'just now';

  // Walk down from minutes: divide until the value fits the next unit.
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['minute', 60],
    ['hour', 60],
    ['day', 24],
    ['week', 7],
  ];

  let amount = seconds;
  let unit: Intl.RelativeTimeFormatUnit = 'second';

  for (const [candidate, step] of units) {
    if (Math.abs(amount) < step) {
      unit = candidate;
      break;
    }
    amount /= step;
    unit = candidate;
  }

  // Beyond a week, "3 weeks ago" is less useful than the actual date.
  if (unit === 'week' && Math.abs(amount) >= 1) return formatDate(date);
  if (unit === 'day' && Math.abs(amount) >= 7) return formatDate(date);

  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  return formatter.format(Math.round(amount), unit);
}

export function formatDate(
  value: Date | string | null | undefined,
  options: Intl.DateTimeFormatOptions = {},
): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
    ...options,
  }).format(date);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** `2026-02-14` in UTC — the wire format used by date-only API fields. */
export function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function toDateOnlyUtc(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function humanFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Deterministic 1..N index so a given id always gets the same accent colour. */
export function stableColorIndex(id: string, buckets = 6): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % buckets;
}
