import { z } from 'zod';
import { NextResponse } from 'next/server';
import { fail, guard, limit, body, parseListQuery, listResponse } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { writeAudit } from '@/lib/audit';
import { notFound } from '@/lib/errors';
import { refreshStudentAlerts } from '@/server/services/progress';
import { Prisma } from '@prisma/client';

/**
 * Student warning alerts.
 *
 * Alerts are raised by the progress engine against configurable rules. They are
 * advisory only: nothing here changes a student's status or blocks anything.
 */
export async function GET(request: Request) {
  try {
    await guard(PERMISSIONS.PROGRESS_VIEW);
    const query = parseListQuery(request);
    const scope = query.params.get('scope') ?? 'alerts';

    if (scope === 'rules') {
      const rules = await prisma.warningRule.findMany({
        orderBy: [{ isEnabled: 'desc' }, { code: 'asc' }],
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          severity: true,
          threshold: true,
          isEnabled: true,
        },
      });

      return NextResponse.json({ data: rules });
    }

    if (scope === 'summary') {
      const [bySeverity, byRule, unresolved] = await Promise.all([
        prisma.studentAlert.groupBy({
          by: ['severity'],
          where: { isResolved: false },
          _count: { _all: true },
        }),
        prisma.studentAlert.groupBy({
          by: ['ruleCode'],
          where: { isResolved: false },
          _count: { _all: true },
        }),
        prisma.studentAlert.count({ where: { isResolved: false } }),
      ]);

      return NextResponse.json({
        data: {
          unresolved,
          bySeverity: Object.fromEntries(bySeverity.map((r) => [r.severity, r._count._all])),
          byRule: Object.fromEntries(byRule.map((r) => [r.ruleCode, r._count._all])),
        },
      });
    }

    const severity = query.params.get('severity');
    const ruleCode = query.params.get('ruleCode');
    const resolved = query.params.get('resolved');

    const where: Prisma.StudentAlertWhereInput = {
      ...(severity ? { severity } : {}),
      ...(ruleCode ? { ruleCode } : {}),
      ...(resolved === 'true' ? { isResolved: true } : resolved === 'false' ? { isResolved: false } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { student: { firstName: { contains: query.search, mode: 'insensitive' } } },
              { student: { lastName: { contains: query.search, mode: 'insensitive' } } },
              { student: { admissionNo: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [rows, total, unresolved] = await Promise.all([
      prisma.studentAlert.findMany({
        where,
        orderBy: [{ isResolved: 'asc' }, { createdAt: 'desc' }],
        skip: query.skip,
        take: query.take,
        select: {
          id: true,
          ruleCode: true,
          severity: true,
          title: true,
          detail: true,
          context: true,
          isResolved: true,
          resolvedAt: true,
          acknowledgedAt: true,
          createdAt: true,
          student: {
            select: {
              id: true,
              admissionNo: true,
              firstName: true,
              lastName: true,
              status: true,
              photoUrl: true,
              enrollments: {
                where: { status: 'ACTIVE' },
                take: 1,
                select: { classSection: { select: { id: true, name: true } } },
              },
            },
          },
        },
      }),
      prisma.studentAlert.count({ where }),
      prisma.studentAlert.count({ where: { isResolved: false } }),
    ]);

    return listResponse(rows, total, Object.assign(query, { unresolved }) as typeof query);
  } catch (error) {
    return fail(error, 'alerts GET');
  }
}

/** Re-evaluate students against the warning rules, or manage a single alert. */
export async function POST(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.PROGRESS_VIEW);
    await limit(request, 'alerts:refresh', 10, 60);

    const payload = await body(
      request,
      z.object({
        classSectionId: z.string().min(1).optional().nullable(),
      }),
    );

    const result = await refreshStudentAlerts({
      classSectionId: payload.classSectionId ?? undefined,
      includeFees: false,
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'alerts.refresh',
      entity: 'StudentAlert',
      after: { evaluated: result.evaluated, created: result.created },
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return fail(error, 'alerts POST');
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.PROGRESS_VIEW);
    await limit(request, 'alerts:update', 60, 60);

    const payload = await body(
      request,
      z.discriminatedUnion('action', [
        z.object({
          action: z.literal('resolve'),
          alertId: z.string().min(1),
          note: z.string().trim().max(500).optional(),
        }),
        z.object({
          action: z.literal('reopen'),
          alertId: z.string().min(1),
        }),
        z.object({
          action: z.literal('toggleRule'),
          ruleId: z.string().min(1),
          isEnabled: z.boolean(),
        }),
      ]),
    );

    if (payload.action === 'toggleRule') {
      const rule = await prisma.warningRule.findUnique({
        where: { id: payload.ruleId },
        select: { id: true, code: true, isEnabled: true },
      });
      if (!rule) throw notFound('Warning rule not found.');

      const updated = await prisma.warningRule.update({
        where: { id: payload.ruleId },
        data: { isEnabled: payload.isEnabled },
        select: { id: true, code: true, isEnabled: true },
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'warning_rule.toggle',
        entity: 'WarningRule',
        entityId: rule.id,
        before: { isEnabled: rule.isEnabled },
        after: { isEnabled: updated.isEnabled },
      });

      return NextResponse.json({ data: updated });
    }

    const alert = await prisma.studentAlert.findUnique({
      where: { id: payload.alertId },
      select: { id: true, studentId: true, ruleCode: true, isResolved: true },
    });
    if (!alert) throw notFound('Alert not found.');

    if (payload.action === 'resolve') {
      const updated = await prisma.studentAlert.update({
        where: { id: payload.alertId },
        data: {
          isResolved: true,
          resolvedAt: new Date(),
          resolvedBy: actor.id,
          acknowledgedAt: new Date(),
        },
        select: { id: true, isResolved: true, resolvedAt: true },
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'alert.resolve',
        entity: 'StudentAlert',
        entityId: alert.id,
        after: { studentId: alert.studentId, ruleCode: alert.ruleCode, note: payload.note ?? null },
      });

      return NextResponse.json({ data: updated });
    }

    const reopened = await prisma.studentAlert.update({
      where: { id: payload.alertId },
      data: { isResolved: false, resolvedAt: null, resolvedBy: null, acknowledgedAt: null },
      select: { id: true, isResolved: true },
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'alert.reopen',
      entity: 'StudentAlert',
      entityId: alert.id,
    });

    return NextResponse.json({ data: reopened });
  } catch (error) {
    return fail(error, 'alerts PUT');
  }
}
