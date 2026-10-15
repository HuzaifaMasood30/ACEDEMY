import { z } from 'zod';
import { NextResponse } from 'next/server';
import { fail, guard, body } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { writeAudit } from '@/lib/audit';
import {
  NotificationCategory,
  NotificationChannel,
  Prisma,
} from '@prisma/client';

const CATEGORIES = [
  'ATTENDANCE_ABSENCE',
  'FEE_REMINDER',
  'FEE_OVERDUE',
  'EXAM_REMINDER',
  'RESULT_PUBLISHED',
  'TIMETABLE_CHANGE',
  'ASSIGNMENT_NEW',
  'ASSIGNMENT_DUE',
  'ANNOUNCEMENT',
  'ADMISSION_UPDATE',
  'ACCOUNT',
  'MANUAL',
] as const;

const CHANNELS = ['WHATSAPP', 'EMAIL', 'SMS', 'IN_APP'] as const;

const updateSchema = z.object({
  preferences: z
    .array(
      z.object({
        channel: z.enum(CHANNELS),
        category: z.enum(CATEGORIES),
        enabled: z.boolean(),
        quietHoursStart: z.coerce.number().int().min(0).max(23).nullable().optional(),
        quietHoursEnd: z.coerce.number().int().min(0).max(23).nullable().optional(),
        language: z.enum(['en', 'ur']).optional(),
      }),
    )
    .max(60),
});

/**
 * Notification preferences for the signed-in account.
 *
 * A guardian controls what they receive about their children, including the
 * quiet hours during which no WhatsApp message should be delivered. The
 * academy's own default applies wherever a row is absent, so an empty list is a
 * valid, meaningful state rather than a reset.
 */
export async function GET() {
  try {
    const actor = await guard(PERMISSIONS.ACADEMY_VIEW);

    const preferences = await prisma.notificationPreference.findMany({
      where: { userId: actor.id },
      orderBy: [{ channel: 'asc' }, { category: 'asc' }],
      select: {
        id: true,
        channel: true,
        category: true,
        enabled: true,
        quietHoursStart: true,
        quietHoursEnd: true,
        language: true,
        optedOut: true,
        optedOutAt: true,
        consentGivenAt: true,
      },
    });

    return NextResponse.json({
      data: {
        preferences,
        channels: CHANNELS,
        categories: CATEGORIES,
        defaults: { quietHoursStart: 21, quietHoursEnd: 7, language: actor.locale },
      },
    });
  } catch (error) {
    return fail(error, 'notification-preferences GET');
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.ACADEMY_VIEW);
    const payload = await body(request, updateSchema);

    // Upsert per (user, channel, category) so a partial save cannot erase rows
    // the caller did not mention.
    await prisma.$transaction(
      payload.preferences.map((preference) =>
        prisma.notificationPreference.upsert({
          where: {
            userId_channel_category: {
              userId: actor.id,
              channel: preference.channel as NotificationChannel,
              category: preference.category as NotificationCategory,
            },
          },
          create: {
            userId: actor.id,
            channel: preference.channel as NotificationChannel,
            category: preference.category as NotificationCategory,
            enabled: preference.enabled,
            quietHoursStart: preference.quietHoursStart ?? null,
            quietHoursEnd: preference.quietHoursEnd ?? null,
            language: preference.language ?? actor.locale,
            optedOut: !preference.enabled,
            optedOutAt: preference.enabled ? null : new Date(),
            consentGivenAt: new Date(),
            consentSource: 'portal',
          },
          update: {
            enabled: preference.enabled,
            quietHoursStart: preference.quietHoursStart ?? null,
            quietHoursEnd: preference.quietHoursEnd ?? null,
            ...(preference.language ? { language: preference.language } : {}),
            optedOut: !preference.enabled,
            optedOutAt: preference.enabled ? null : new Date(),
          },
        }),
      ),
    );

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'notification.preferences',
      entity: 'NotificationPreference',
      after: { updated: payload.preferences.length },
    });

    return NextResponse.json({ data: { updated: payload.preferences.length } });
  } catch (error) {
    return fail(error, 'notification-preferences PUT');
  }
}
