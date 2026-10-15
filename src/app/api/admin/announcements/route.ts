import { z } from 'zod';
import { NextResponse } from 'next/server';
import { fail, guard, limit, body, parseListQuery, listResponse } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { writeAudit } from '@/lib/audit';
import { queueAnnouncementNotifications } from '@/server/notifications/events';
import { Prisma } from '@prisma/client';

const announcementSchema = z.object({
  title: z.string().trim().min(3, 'Give the announcement a title.').max(160),
  body: z.string().trim().min(3, 'Write the announcement body.').max(4000),
  audience: z.enum(['ALL', 'STUDENTS', 'PARENTS', 'TEACHERS', 'APPLICANTS', 'CLASS']),
  classSectionId: z.string().min(1).optional().nullable(),
  priority: z.enum(['NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  publishAt: z.coerce.date().optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
  /** Also deliver by WhatsApp. Off by default: announcements are in-app first. */
  notify: z.boolean().default(false),
});

/**
 * Announcements.
 *
 * Publishing is separate from creating: a draft can be prepared and reviewed
 * before anything reaches students or guardians.
 */
export async function GET(request: Request) {
  try {
    await guard(PERMISSIONS.ANNOUNCEMENT_VIEW);
    const query = parseListQuery(request);
    const status = query.params.get('status');
    const audience = query.params.get('audience');

    const where: Prisma.AnnouncementWhereInput = {
      ...(status ? { status } : {}),
      ...(audience ? { audience } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { body: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.announcement.findMany({
        where,
        orderBy: [{ publishAt: 'desc' }, { createdAt: 'desc' }],
        skip: query.skip,
        take: query.take,
        select: {
          id: true,
          title: true,
          body: true,
          audience: true,
          priority: true,
          status: true,
          publishAt: true,
          expiresAt: true,
          createdAt: true,
          author: { select: { id: true, name: true } },
          _count: { select: { reads: true } },
        },
      }),
      prisma.announcement.count({ where }),
    ]);

    return listResponse(rows, total, query);
  } catch (error) {
    return fail(error, 'announcements GET');
  }
}

/** Create an announcement, optionally publishing it immediately. */
export async function POST(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.ANNOUNCEMENT_CREATE);
    await limit(request, 'announcements:create', 40, 60);

    const payload = await body(request, announcementSchema);

    if (payload.audience === 'CLASS' && !payload.classSectionId) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message: 'Choose a class when the audience is a single class.',
          },
        },
        { status: 422 },
      );
    }

    const publishAt = payload.publishAt ?? null;
    const status = publishAt && publishAt.getTime() > Date.now() ? 'SCHEDULED' : 'PUBLISHED';

    const announcement = await prisma.announcement.create({
      data: {
        title: payload.title,
        body: payload.body,
        audience: payload.audience,
        classSectionId: payload.classSectionId ?? null,
        priority: payload.priority,
        status,
        publishAt: publishAt ?? new Date(),
        expiresAt: payload.expiresAt ?? null,
        sendWhatsApp: payload.notify,
        authorId: actor.id,
      },
      select: { id: true, title: true, status: true, audience: true, publishAt: true },
    });

    let notificationsQueued = 0;

    if (payload.notify && status === 'PUBLISHED') {
      try {
        const classSectionIds = payload.classSectionId ? [payload.classSectionId] : undefined;
        const result = await queueAnnouncementNotifications({
          announcementId: announcement.id,
          title: payload.title,
          body: payload.body,
          classSectionIds,
          createdByUserId: actor.id,
        });
        notificationsQueued = result.queued;
      } catch (notificationError) {
        console.error('[announcements] fan-out failed:', notificationError);
      }
    }

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'announcement.create',
      entity: 'Announcement',
      entityId: announcement.id,
      after: {
        title: payload.title,
        audience: payload.audience,
        status,
        notify: payload.notify,
        notificationsQueued,
      },
    });

    return NextResponse.json(
      { data: { ...announcement, notificationsQueued } },
      { status: 201 },
    );
  } catch (error) {
    return fail(error, 'announcements POST');
  }
}

/** Publish, archive or reschedule an existing announcement. */
export async function PUT(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.ANNOUNCEMENT_CREATE);
    await limit(request, 'announcements:update', 60, 60);

    const payload = await body(
      request,
      z.object({
        id: z.string().min(1),
        status: z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']),
        publishAt: z.coerce.date().optional().nullable(),
        notify: z.boolean().default(false),
      }),
    );

    const existing = await prisma.announcement.findUnique({ where: { id: payload.id } });
    if (!existing) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Announcement not found.' } },
        { status: 404 },
      );
    }

    const updated = await prisma.announcement.update({
      where: { id: payload.id },
      data: {
        status: payload.status,
        ...(payload.publishAt !== undefined
          ? { publishAt: payload.publishAt ?? new Date() }
          : {}),
      },
      select: { id: true, title: true, body: true, status: true, classSectionId: true },
    });

    let notificationsQueued = 0;

    if (payload.notify && payload.status === 'PUBLISHED') {
      try {
        const result = await queueAnnouncementNotifications({
          announcementId: updated.id,
          title: updated.title,
          body: updated.body,
          classSectionIds: updated.classSectionId ? [updated.classSectionId] : undefined,
          createdByUserId: actor.id,
        });
        notificationsQueued = result.queued;
      } catch (notificationError) {
        console.error('[announcements] fan-out failed:', notificationError);
      }
    }

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'announcement.update',
      entity: 'Announcement',
      entityId: updated.id,
      before: { status: existing.status },
      after: { status: updated.status, notificationsQueued },
    });

    return NextResponse.json({ data: { ...updated, notificationsQueued } });
  } catch (error) {
    return fail(error, 'announcements PUT');
  }
}
