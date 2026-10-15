import { z } from 'zod';

/** Shared primitives so every module validates the same way. */

export const cuid = z.string().min(1, 'A valid identifier is required.');

export const nonEmptyString = z.string().trim().min(1, 'This field is required.');

export const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : v))
  .optional();

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address.');

/** Loose international phone check — deliberately permissive, digits and + only. */
export const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s\-()]{7,20}$/, 'Enter a valid phone number.')
  .transform((v) => v.replace(/[\s\-()]/g, ''));

export const optionalPhone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s\-()]/g, ''))
  .refine((v) => v === '' || /^\+?[0-9]{7,20}$/.test(v), 'Enter a valid phone number.')
  .transform((v) => (v === '' ? undefined : v))
  .optional();

export const password = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password is too long.')
  .regex(/[a-z]/, 'Password must contain a lowercase letter.')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter.')
  .regex(/[0-9]/, 'Password must contain a number.');

/** Dates arrive as `YYYY-MM-DD` from date inputs. */
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format.')
  .transform((v) => new Date(`${v}T00:00:00.000Z`));

export const optionalDateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format.')
  .transform((v) => new Date(`${v}T00:00:00.000Z`))
  .optional();

export const dateTime = z.coerce.date();

export const money = z.coerce
  .number()
  .finite()
  .min(0, 'Amount cannot be negative.')
  .max(9_999_999_999, 'Amount is too large.')
  .transform((v) => Math.round(v * 100) / 100);

export const percentage = z.coerce.number().min(0).max(100);

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

export type Pagination = z.infer<typeof pagination>;

export const sortDirection = z.enum(['asc', 'desc']).default('desc');

/** `HH:MM` 24-hour clock used by timetable and quiet-hours inputs. */
export const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the HH:MM 24-hour format.');

export function timeOfDayToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToTimeOfDay(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const fileUpload = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});

export function buildPageMeta(total: number, page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}
