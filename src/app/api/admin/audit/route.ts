import { NextResponse } from 'next/server';
import { fail, guard, parseListQuery, listResponse } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

/**
 * Audit trail and system events.
 *
 * Read-only by design: an audit log an administrator can edit is not an audit
 * log. Entries are written by the actions that change data, never here.
 */
export async function GET(request: Request) {
  try {
    await guard(PERMISSIONS.AUDIT_VIEW);
    const query = parseListQuery(request);
    const scope = query.params.get('scope') ?? 'audit';

    if (scope === 'events') {
      const level = query.params.get('level');
      const source = query.params.get('source');
      const since = query.params.get('since');

      const where: Prisma.SystemEventWhereInput = {
        ...(level ? { level } : {}),
        ...(source ? { source } : {}),
        ...(since ? { createdAt: { gte: new Date(since) } } : {}),
        ...(query.search
          ? {
              OR: [
                { message: { contains: query.search, mode: 'insensitive' } },
                { source: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      };

      const [rows, total, byLevel] = await Promise.all([
        prisma.systemEvent.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: query.skip,
          take: query.take,
        }),
        prisma.systemEvent.count({ where }),
        prisma.systemEvent.groupBy({ by: ['level'], _count: { _all: true } }),
      ]);

      return listResponse(
        rows,
        total,
        Object.assign(query, {
          counts: Object.fromEntries(byLevel.map((r) => [r.level, r._count._all])),
        }) as typeof query,
      );
    }

    const action = query.params.get('action');
    const entity = query.params.get('entity');
    const actorRole = query.params.get('actorRole');
    const from = query.params.get('from');
    const to = query.params.get('to');

    const where: Prisma.AuditLogWhereInput = {
      ...(action ? { action: { contains: action, mode: 'insensitive' } } : {}),
      ...(entity ? { entity } : {}),
      ...(actorRole ? { actorRole: actorRole as never } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
              ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { action: { contains: query.search, mode: 'insensitive' } },
              { entity: { contains: query.search, mode: 'insensitive' } },
              { actorEmail: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total, byAction] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.groupBy({
        by: ['action'],
        _count: { _all: true },
        orderBy: { _count: { action: 'desc' } },
        take: 10,
      }),
    ]);

    return listResponse(
      rows,
      total,
      Object.assign(query, {
        topActions: byAction.map((r) => ({ action: r.action, count: r._count._all })),
      }) as typeof query,
    );
  } catch (error) {
    return fail(error, 'audit GET');
  }
}
