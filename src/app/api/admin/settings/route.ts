import { z } from 'zod';
import { NextResponse } from 'next/server';
import { fail, guard, limit, body } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { writeAudit } from '@/lib/audit';
import {
  getAttendanceRules,
  getFeeRules,
  getNotificationRules,
  getAcademicRules,
  getGradingDefaults,
  getAcademyProfile,
  patchSetting,
  listSettings,
  setSetting,
} from '@/server/settings';
import {
  DEFAULT_ACADEMIC_RULES,
  DEFAULT_ATTENDANCE_RULES,
  DEFAULT_FEE_RULES,
  DEFAULT_GRADING_DEFAULTS,
  DEFAULT_NOTIFICATION_RULES,
  SETTING_KEYS,
} from '@/lib/config';
import { loadGradeScale } from '@/server/services/exams';

/** Every configurable rules block, in one payload for the settings screen. */
export async function GET() {
  try {
    await guard(PERMISSIONS.SETTINGS_VIEW);

    const [attendance, fee, notification, academic, grading, academy, gradeScale, stored] =
      await Promise.all([
        getAttendanceRules(),
        getFeeRules(),
        getNotificationRules(),
        getAcademicRules(),
        getGradingDefaults(),
        getAcademyProfile(),
        loadGradeScale(null),
        listSettings(),
      ]);

    return NextResponse.json({
      data: {
        attendance,
        fee,
        notification,
        academic,
        grading,
        academy,
        gradeScale,
        // Only the categories an administrator may edit in place.
        settings: stored.filter((row) => row.category !== 'sequence'),
      },
    });
  } catch (error) {
    return fail(error, 'settings GET');
  }
}

/**
 * Update one settings block.
 *
 * Each block is validated against its own schema and merged into the stored
 * object, so a partial update cannot blank out the fields it omits.
 */
export async function PUT(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.SETTINGS_MANAGE);
    await limit(request, 'settings:update', 40, 60);

    const payload = await body(
      request,
      z.discriminatedUnion('block', [
        z.object({
          block: z.literal('attendance'),
          values: z
            .object({
              minimumPercentage: z.coerce.number().min(0).max(100).optional(),
              consecutiveAbsenceThreshold: z.coerce.number().int().min(1).max(30).optional(),
              editWindowDays: z.coerce.number().int().min(0).max(30).optional(),
              requireApprovalForEdits: z.boolean().optional(),
              notifyGuardiansOnAbsence: z.boolean().optional(),
              notifyOnLateArrival: z.boolean().optional(),
            })
            .strict(),
        }),
        z.object({
          block: z.literal('fee'),
          values: z
            .object({
              invoicePrefix: z.string().trim().min(1).max(12).optional(),
              receiptPrefix: z.string().trim().min(1).max(12).optional(),
              lateFeeGraceDays: z.coerce.number().int().min(0).max(90).optional(),
              lateFeeAmount: z.coerce.number().min(0).max(1_000_000).optional(),
              lateFeeIsPercentage: z.boolean().optional(),
              reminderOffsetsDays: z
                .array(z.coerce.number().int().min(-180).max(180))
                .max(10)
                .optional(),
            })
            .strict(),
        }),
        z.object({
          block: z.literal('notification'),
          values: z
            .object({
              absenceNotificationsEnabled: z.boolean().optional(),
              resultNotificationsEnabled: z.boolean().optional(),
              feeReminderEnabled: z.boolean().optional(),
              examReminderEnabled: z.boolean().optional(),
              examReminderLeadDays: z.coerce.number().int().min(0).max(60).optional(),
              bulkRateLimitPerHour: z.coerce.number().int().min(0).max(10_000).optional(),
              respectQuietHours: z.boolean().optional(),
            })
            .strict(),
        }),
        z.object({
          block: z.literal('academic'),
          values: z
            .object({
              passingPercentage: z.coerce.number().min(0).max(100).optional(),
              promotionMinimumAttendance: z.coerce.number().min(0).max(100).optional(),
              promotionMinimumPercentage: z.coerce.number().min(0).max(100).optional(),
              studentIdPrefix: z.string().trim().min(1).max(10).optional(),
              duplicateDetectionFields: z.array(z.string().trim().min(1)).max(10).optional(),
            })
            .strict(),
        }),
        z.object({
          block: z.literal('grading'),
          values: z
            .object({
              defaultScaleName: z.string().trim().min(1).max(80).optional(),
              showRankInResults: z.boolean().optional(),
              roundToDecimals: z.coerce.number().int().min(0).max(4).optional(),
            })
            .strict(),
        }),
        z.object({
          block: z.literal('academy'),
          values: z
            .object({
              name: z.string().trim().min(2).max(120).optional(),
              tagline: z.string().trim().max(200).optional(),
              email: z.string().trim().email().optional(),
              phone: z.string().trim().max(30).optional(),
              address: z.string().trim().max(400).optional(),
              website: z.string().trim().max(200).optional(),
            })
            .strict(),
        }),
      ]),
    );

    const fallbacks = {
      attendance: DEFAULT_ATTENDANCE_RULES,
      fee: DEFAULT_FEE_RULES,
      notification: DEFAULT_NOTIFICATION_RULES,
      academic: DEFAULT_ACADEMIC_RULES,
      grading: DEFAULT_GRADING_DEFAULTS,
      academy: null,
    } as const;

    const keyByBlock = {
      attendance: SETTING_KEYS.attendanceRules,
      fee: SETTING_KEYS.feeRules,
      notification: SETTING_KEYS.notificationRules,
      academic: SETTING_KEYS.academicRules,
      grading: SETTING_KEYS.gradingDefaults,
      academy: SETTING_KEYS.academyProfile,
    } as const;

    const categoryByBlock = {
      attendance: 'attendance',
      fee: 'fees',
      notification: 'notifications',
      academic: 'academic',
      grading: 'academic',
      academy: 'general',
    } as const;

    let updated: unknown;

    if (payload.block === 'academy') {
      const current = await getAcademyProfile();
      updated = await patchSetting(
        keyByBlock.academy,
        { ...current, ...payload.values },
        current,
        categoryByBlock.academy,
      );
    } else {
      const fallback = fallbacks[payload.block];
      updated = await patchSetting(
        keyByBlock[payload.block],
        payload.values as Record<string, unknown>,
        fallback as object,
        categoryByBlock[payload.block],
      );
    }

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'settings.update',
      entity: 'Setting',
      entityId: keyByBlock[payload.block],
      after: { block: payload.block, values: payload.values },
    });

    return NextResponse.json({ data: { block: payload.block, values: updated } });
  } catch (error) {
    return fail(error, 'settings PUT');
  }
}

/** Set a single raw setting row — used by the advanced configuration panel. */
export async function PATCH(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.SETTINGS_MANAGE);
    await limit(request, 'settings:raw', 40, 60);

    const payload = await body(
      request,
      z.object({
        key: z.string().trim().min(1).max(80),
        value: z.unknown(),
        category: z.string().trim().max(40).default('general'),
      }),
    );

    // Sequence counters back invoice and receipt numbering. Allowing them to be
    // edited would let an administrator reissue a number that already exists.
    if (payload.key.startsWith('sequence:')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Sequence counters cannot be edited.',
          },
        },
        { status: 403 },
      );
    }

    await setSetting(payload.key, payload.value, payload.category);

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'settings.raw_update',
      entity: 'Setting',
      entityId: payload.key,
      after: { key: payload.key, category: payload.category },
    });

    return NextResponse.json({ data: { key: payload.key } });
  } catch (error) {
    return fail(error, 'settings PATCH');
  }
}
