import { prisma } from '@/lib/prisma';
import {
  academyConfig,
  DEFAULT_ATTENDANCE_RULES,
  DEFAULT_ACADEMIC_RULES,
  DEFAULT_FEE_RULES,
  DEFAULT_GRADING_DEFAULTS,
  DEFAULT_NOTIFICATION_RULES,
  SETTING_KEYS,
  type AcademicRules,
  type AttendanceRules,
  type FeeRules,
  type GradingDefaults,
  type NotificationRules,
} from '@/lib/config';
import type { Prisma } from '@prisma/client';

/**
 * Settings are stored as JSON rows so the academy can change rules without a
 * deploy. Reads fall back to the compiled defaults when a row is absent or
 * malformed, which keeps the application usable on a fresh database.
 */

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return fallback;

  const value = row.value as unknown;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return fallback;
  }

  // Shallow merge so a partially-written row still yields a complete object.
  return { ...(fallback as object), ...(value as object) } as T;
}

export async function getAttendanceRules(): Promise<AttendanceRules> {
  return readSetting(SETTING_KEYS.attendanceRules, DEFAULT_ATTENDANCE_RULES);
}

export async function getFeeRules(): Promise<FeeRules> {
  return readSetting(SETTING_KEYS.feeRules, DEFAULT_FEE_RULES);
}

export async function getNotificationRules(): Promise<NotificationRules> {
  return readSetting(SETTING_KEYS.notificationRules, DEFAULT_NOTIFICATION_RULES);
}

export async function getAcademicRules(): Promise<AcademicRules> {
  return readSetting(SETTING_KEYS.academicRules, DEFAULT_ACADEMIC_RULES);
}

export async function getGradingDefaults(): Promise<GradingDefaults> {
  return readSetting(SETTING_KEYS.gradingDefaults, DEFAULT_GRADING_DEFAULTS);
}

export interface AcademyProfile {
  name: string;
  tagline: string;
  email: string;
  phone: string;
  address: string;
  website: string;
}

const DEFAULT_ACADEMY_PROFILE: AcademyProfile = {
  name: academyConfig.name,
  tagline: 'Building confident learners',
  email: 'office@academy.example',
  phone: '+920000000000',
  address: 'Academy address not configured',
  website: '',
};

/**
 * Academy identity used by the public site, PDFs and message templates.
 * Falls back to environment defaults so the public site renders before an
 * administrator has filled in the settings screen.
 */
export async function getAcademyProfile(): Promise<AcademyProfile> {
  return readSetting(SETTING_KEYS.academyProfile, DEFAULT_ACADEMY_PROFILE);
}

export async function setSetting(
  key: string,
  value: unknown,
  category = 'general',
): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: value as Prisma.InputJsonValue, category },
    update: { value: value as Prisma.InputJsonValue, category },
  });
}

export async function listSettings(category?: string) {
  return prisma.setting.findMany({
    where: category ? { category } : undefined,
    orderBy: { key: 'asc' },
  });
}

/** Merge a partial patch into a stored settings object. */
export async function patchSetting<T extends object>(
  key: string,
  patch: Partial<T>,
  fallback: T,
  category = 'general',
): Promise<T> {
  const current = await readSetting(key, fallback);
  const next = { ...current, ...patch } as T;
  await setSetting(key, next, category);
  return next;
}
