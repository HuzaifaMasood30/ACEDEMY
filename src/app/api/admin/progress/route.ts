import { z } from 'zod';
import { NextResponse } from 'next/server';
import { fail, guard, limit, body, parseListQuery, listResponse } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { writeAudit } from '@/lib/audit';
import {
  buildStudentProgress,
  refreshStudentAlerts,
  academyProgressOverview,
} from '@/server/services/progress';
import { assertStudentAccess, getVisibleStudentIds } from '@/server/auth-guard';
import { Prisma } from '@prisma/client';

/**
 * Progress profiles, alerts and progress notes.
 *
 * The fee block is only included when the actor is permitted to see fees, so a
 * teacher reading a progress profile never receives the family's financial
 * position even though the same endpoint serves the administrator.
 */
export async function GET(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.PROGRESS_VIEW);
    const query = parseListQuery(request);
    const scope = query.params.get('scope') ?? 'student';

    if (scope === 'overview') {
      return NextResponse.json({
        data: await academyProgressOverview({
          classSectionId: query.params.get('classSectionId') ?? undefined,
        }),
      });
    }

    if (scope === 'alerts') {
      const visible = await getVisibleStudentIds(actor);

      const where: Prisma.StudentAlertWhereInput = {
        studentId: { in: visible },
        ...(query.params.get('resolved') === 'true'
          ? { isResolved: true }
          : query.params.get('resolved') === 'false'
            ? { isResolved: false }
            : {}),
        ...(query.params.get('severity') ? { severity: query.params.get('severity') as string } : {}),
        ...(query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' } },
                { detail: { contains: query.search, mode: 'insensitive' } },
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
            acknowledgedAt: true,
            createdAt: true,
            student: {
              select: { id: true, firstName: true, lastName: true, admissionNo: true },
            },
          },
        }),
        prisma.studentAlert.count({ where }),
        prisma.studentAlert.count({ where: { studentId: { in: visible }, isResolved: false } }),
      ]);

      return listResponse(rows, total, Object.assign(query, { unresolved }) as typeof query);
    }

    if (scope === 'notes') {
      const studentId = query.params.get('studentId');
      if (!studentId) {
        return NextResponse.json(
          { error: { code: 'VALIDATION', message: 'A student is required.' } },
          { status: 422 },
        );
      }

      await assertStudentAccess(actor, studentId);

      // Private staff notes are withheld unless the actor holds the permission.
      const canSeePrivate = actor.permissions.has(PERMISSIONS.PROGRESS_NOTE_VIEW_PRIVATE);

      const notes = await prisma.progressNote.findMany({
        where: {
          studentId,
          ...(canSeePrivate ? {} : { visibility: { not: 'STAFF_PRIVATE' } }),
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          category: true,
          visibility: true,
          body: true,
          createdAt: true,
          author: { select: { id: true, name: true } },
        },
      });

      return NextResponse.json({ data: notes });
    }

    const studentId = query.params.get('studentId');
    if (!studentId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'A student is required.' } },
        { status: 422 },
      );
    }

    await assertStudentAccess(actor, studentId);

    // Teachers never receive the fee section; only fee-authorized roles do.
    const includeFees = actor.permissions.has(PERMISSIONS.INVOICE_VIEW) && actor.role !== 'TEACHER';

    return NextResponse.json({
      data: await buildStudentProgress(studentId, { includeFees }),
    });
  } catch (error) {
    return fail(error, 'progress GET');
  }
}

/** Add a progress note, or resolve an alert. */
export async function POST(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.PROGRESS_NOTE_CREATE);
    await limit(request, 'progress:write', 60, 60);

    const payload = await body(
      request,
      z.discriminatedUnion('action', [
        z.object({
          action: z.literal('note'),
          studentId: z.string().min(1),
          category: z.enum(['ACADEMIC', 'BEHAVIOUR', 'ATTENDANCE', 'ACHIEVEMENT', 'GENERAL']),
          visibility: z.enum(['STAFF_PRIVATE', 'STAFF_PARENT', 'STAFF_STUDENT_PARENT']),
          body: z.string().trim().min(3, 'Write the note.').max(2000),
        }),
        z.object({
          action: z.literal('resolveAlert'),
          alertId: z.string().min(1),
          resolutionNote: z.string().trim().max(500).optional(),
        }),
        z.object({
          action: z.literal('refresh'),
          classSectionId: z.string().min(1).optional().nullable(),
          includeFees: z.boolean().default(false),
        }),
      ]),
    );

    if (payload.action === 'note') {
      await assertStudentAccess(actor, payload.studentId);

      // Only an actor holding the private-note permission may author one.
      if (
        payload.visibility === 'STAFF_PRIVATE' &&
        !actor.permissions.has(PERMISSIONS.PROGRESS_NOTE_VIEW_PRIVATE)
      ) {
        return NextResponse.json(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'You cannot create a staff-private note.',
            },
          },
          { status: 403 },
        );
      }

      const note = await prisma.progressNote.create({
        data: {
          studentId: payload.studentId,
          authorId: actor.id,
          category: payload.category,
          visibility: payload.visibility,
          body: payload.body,
        },
        select: { id: true, category: true, visibility: true, createdAt: true },
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'progress_note.create',
        entity: 'ProgressNote',
        entityId: note.id,
        after: {
          studentId: payload.studentId,
          category: payload.category,
          visibility: payload.visibility,
        },
      });

      return NextResponse.json({ data: note }, { status: 201 });
    }

    if (payload.action === 'resolveAlert') {
      const alert = await prisma.studentAlert.findUnique({
        where: { id: payload.alertId },
        select: { id: true, studentId: true, isResolved: true },
      });

      if (!alert) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Alert not found.' } },
          { status: 404 },
        );
      }

      await assertStudentAccess(actor, alert.studentId);

      const updated = await prisma.studentAlert.update({
        where: { id: alert.id },
        data: {
          isResolved: true,
          resolvedBy: actor.id,
          resolvedAt: new Date(),
          ...(payload.resolutionNote
            ? { detail: payload.resolutionNote }
            : {}),
        },
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'alert.resolve',
        entity: 'StudentAlert',
        entityId: alert.id,
        after: { resolutionNote: payload.resolutionNote ?? null },
      });

      return NextResponse.json({ data: updated });
    }

    // refresh
    const result = await refreshStudentAlerts({
      classSectionId: payload.classSectionId ?? undefined,
      includeFees: payload.includeFees,
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'alert.refresh',
      entity: 'StudentAlert',
      after: { ...result, classSectionId: payload.classSectionId ?? null },
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return fail(error, 'progress POST');
  }
}
