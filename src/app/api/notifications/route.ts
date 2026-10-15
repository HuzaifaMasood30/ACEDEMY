import { NextResponse } from 'next/server';
import { fail, guard, parseListQuery, ok } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { Prisma, Role } from '@prisma/client';

/**
 * The signed-in account's own notification history.
 *
 * Unlike the administrative delivery log, this endpoint never exposes the
 * queue: it resolves the recipient's own phone numbers and student links, so a
 * guardian sees only messages addressed to them about their own children.
 */
export async function GET(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.ACADEMY_VIEW);
    const query = parseListQuery(request);

    // Resolve which student records belong to this actor, so a message is
    // matched by recipient account or by the child it concerns.
    const studentIds =
      actor.role === Role.STUDENT && actor.studentId
        ? [actor.studentId]
        : actor.role === Role.PARENT
          ? (
              await prisma.guardianLink.findMany({
                where: { guardianUserId: actor.id },
                select: { studentId: true },
              })
            ).map((link) => link.studentId)
          : [];

    const where: Prisma.NotificationJobWhereInput = {
      ...(actor.role === Role.ADMIN
        ? {}
        : {
            OR: [
              { recipientUserId: actor.id },
              ...(studentIds.length > 0 ? [{ studentId: { in: studentIds } }] : []),
            ],
          }),
      ...(query.params.get('category')
        ? { category: query.params.get('category') as never }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.notificationJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
        select: {
          id: true,
          category: true,
          channel: true,
          status: true,
          body: true,
          locale: true,
          studentId: true,
          relatedEntity: true,
          relatedEntityId: true,
          sentAt: true,
          deliveredAt: true,
          readAt: true,
          createdAt: true,
        },
      }),
      prisma.notificationJob.count({ where }),
    ]);

    const unread = await prisma.notificationJob.count({
      where: { ...where, readAt: null, status: { in: ['SENT', 'DELIVERED'] } },
    });

    const pages = Math.max(1, Math.ceil(total / query.pageSize));

    return ok(rows, {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: pages,
      hasNext: query.page < pages,
      hasPrev: query.page > 1,
      unread,
    });
  } catch (error) {
    return fail(error, 'notifications GET');
  }
}

/** Mark notifications as read. Only the recipient's own rows are touched. */
export async function PATCH(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.ACADEMY_VIEW);
    const payload = (await request.json()) as { ids?: string[]; all?: boolean };

    if (payload.all) {
      const result = await prisma.notificationJob.updateMany({
        where: { recipientUserId: actor.id, readAt: null },
        data: { readAt: new Date() },
      });
      return NextResponse.json({ data: { updated: result.count } });
    }

    const ids = Array.isArray(payload.ids) ? payload.ids.slice(0, 200) : [];
    if (ids.length === 0) {
      return NextResponse.json({ data: { updated: 0 } });
    }

    // The recipient filter is part of the update predicate, so a forged id
    // cannot mark somebody else's notification as read.
    const result = await prisma.notificationJob.updateMany({
      where: { id: { in: ids }, recipientUserId: actor.id },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ data: { updated: result.count } });
  } catch (error) {
    return fail(error, 'notifications PATCH');
  }
}
