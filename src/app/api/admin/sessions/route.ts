import { z } from 'zod';
import { NextResponse } from 'next/server';
import { fail, guard, limit, body, parseListQuery } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { writeAudit } from '@/lib/audit';
import { conflict, notFound, validationError } from '@/lib/errors';

/**
 * Academic sessions, terms and holidays.
 *
 * Exactly one session is current. Making a session current demotes the previous
 * one inside the same transaction so the invariant can never be observed broken.
 */

export async function GET(request: Request) {
  try {
    await guard(PERMISSIONS.SESSION_VIEW);
    const query = parseListQuery(request);
    const scope = query.params.get('scope') ?? 'sessions';

    if (scope === 'terms') {
      const academicSessionId = query.params.get('academicSessionId');
      const terms = await prisma.term.findMany({
        where: academicSessionId ? { academicSessionId } : undefined,
        orderBy: [{ academicSession: { startDate: 'desc' } }, { sequence: 'asc' }],
        select: {
          id: true,
          name: true,
          sequence: true,
          startDate: true,
          endDate: true,
          isCurrent: true,
          academicSession: { select: { id: true, name: true } },
          _count: { select: { exams: true, invoices: true } },
        },
      });

      return NextResponse.json({ data: terms });
    }

    if (scope === 'holidays') {
      const holidays = await prisma.holiday.findMany({
        orderBy: { date: 'asc' },
        take: 200,
        select: {
          id: true,
          name: true,
          date: true,
          endDate: true,
          description: true,
          isRecurring: true,
          campusId: true,
        },
      });

      return NextResponse.json({ data: holidays });
    }

    const [sessions, campuses] = await Promise.all([
      prisma.academicSession.findMany({
        orderBy: { startDate: 'desc' },
        select: {
          id: true,
          name: true,
          code: true,
          startDate: true,
          endDate: true,
          isCurrent: true,
          campusId: true,
          campus: { select: { id: true, name: true } },
          _count: { select: { terms: true, classSections: true, enrollments: true } },
        },
      }),
      prisma.campus.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true },
      }),
    ]);

    return NextResponse.json({ data: { sessions, campuses } });
  } catch (error) {
    return fail(error, 'sessions GET');
  }
}

export async function POST(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.SESSION_MANAGE);
    await limit(request, 'sessions:write', 40, 60);

    const payload = await body(
      request,
      z.discriminatedUnion('action', [
        z.object({
          action: z.literal('session'),
          name: z.string().trim().min(4).max(60),
          code: z
            .string()
            .trim()
            .min(4)
            .max(20)
            .regex(/^[A-Z0-9-]+$/i, 'Use letters, numbers and hyphens only.'),
          startDate: z.coerce.date(),
          endDate: z.coerce.date(),
          campusId: z.string().min(1).optional().nullable(),
          makeCurrent: z.boolean().default(false),
        }),
        z.object({
          action: z.literal('term'),
          academicSessionId: z.string().min(1),
          name: z.string().trim().min(2).max(60),
          sequence: z.coerce.number().int().min(1).max(12),
          startDate: z.coerce.date(),
          endDate: z.coerce.date(),
        }),
        z.object({
          action: z.literal('holiday'),
          name: z.string().trim().min(2).max(120),
          date: z.coerce.date(),
          endDate: z.coerce.date().optional().nullable(),
          description: z.string().trim().max(500).optional().nullable(),
          isRecurring: z.boolean().default(false),
          campusId: z.string().min(1).optional().nullable(),
        }),
      ]),
    );

    if (payload.action === 'session') {
      if (payload.endDate <= payload.startDate) {
        throw validationError('The session end date must be after the start date.');
      }

      const code = payload.code.toUpperCase();
      const duplicate = await prisma.academicSession.findUnique({ where: { code } });
      if (duplicate) throw conflict(`A session with the code ${code} already exists.`);

      const session = await prisma.$transaction(async (tx) => {
        if (payload.makeCurrent) {
          await tx.academicSession.updateMany({
            where: { isCurrent: true },
            data: { isCurrent: false },
          });
        }

        return tx.academicSession.create({
          data: {
            name: payload.name,
            code,
            startDate: payload.startDate,
            endDate: payload.endDate,
            campusId: payload.campusId ?? null,
            isCurrent: payload.makeCurrent,
          },
          select: { id: true, name: true, code: true, isCurrent: true },
        });
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'session.create',
        entity: 'AcademicSession',
        entityId: session.id,
        after: { code: session.code, name: session.name, isCurrent: session.isCurrent },
      });

      return NextResponse.json({ data: session }, { status: 201 });
    }

    if (payload.action === 'term') {
      if (payload.endDate <= payload.startDate) {
        throw validationError('The term end date must be after the start date.');
      }

      const session = await prisma.academicSession.findUnique({
        where: { id: payload.academicSessionId },
        select: { id: true },
      });
      if (!session) throw notFound('Academic session not found.');

      const term = await prisma.term.create({
        data: {
          academicSessionId: payload.academicSessionId,
          name: payload.name,
          sequence: payload.sequence,
          startDate: payload.startDate,
          endDate: payload.endDate,
        },
        select: { id: true, name: true, sequence: true },
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'term.create',
        entity: 'Term',
        entityId: term.id,
        after: { name: term.name, sequence: term.sequence },
      });

      return NextResponse.json({ data: term }, { status: 201 });
    }

    if (payload.endDate && payload.endDate < payload.date) {
      throw validationError('The holiday end date cannot be before its start date.');
    }

    const holiday = await prisma.holiday.create({
      data: {
        name: payload.name,
        date: payload.date,
        endDate: payload.endDate ?? null,
        description: payload.description ?? null,
        isRecurring: payload.isRecurring,
        campusId: payload.campusId ?? null,
      },
      select: { id: true, name: true, date: true, endDate: true },
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'holiday.create',
      entity: 'Holiday',
      entityId: holiday.id,
      after: { name: holiday.name },
    });

    return NextResponse.json({ data: holiday }, { status: 201 });
  } catch (error) {
    return fail(error, 'sessions POST');
  }
}

/** Promote a session to current, or a term to current within its session. */
export async function PUT(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.SESSION_MANAGE);
    await limit(request, 'sessions:update', 40, 60);

    const payload = await body(
      request,
      z.discriminatedUnion('action', [
        z.object({
          action: z.literal('setCurrentSession'),
          sessionId: z.string().min(1),
        }),
        z.object({
          action: z.literal('setCurrentTerm'),
          termId: z.string().min(1),
        }),
        z.object({
          action: z.literal('deleteHoliday'),
          holidayId: z.string().min(1),
        }),
      ]),
    );

    if (payload.action === 'setCurrentSession') {
      const session = await prisma.academicSession.findUnique({
        where: { id: payload.sessionId },
        select: { id: true, name: true },
      });
      if (!session) throw notFound('Academic session not found.');

      await prisma.$transaction([
        prisma.academicSession.updateMany({
          where: { isCurrent: true },
          data: { isCurrent: false },
        }),
        prisma.academicSession.update({
          where: { id: payload.sessionId },
          data: { isCurrent: true },
        }),
      ]);

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'session.set_current',
        entity: 'AcademicSession',
        entityId: payload.sessionId,
        after: { name: session.name },
      });

      return NextResponse.json({ data: { sessionId: payload.sessionId, isCurrent: true } });
    }

    if (payload.action === 'setCurrentTerm') {
      const term = await prisma.term.findUnique({
        where: { id: payload.termId },
        select: { id: true, academicSessionId: true, name: true },
      });
      if (!term) throw notFound('Term not found.');

      await prisma.$transaction([
        prisma.term.updateMany({
          where: { academicSessionId: term.academicSessionId, isCurrent: true },
          data: { isCurrent: false },
        }),
        prisma.term.update({ where: { id: term.id }, data: { isCurrent: true } }),
      ]);

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'term.set_current',
        entity: 'Term',
        entityId: term.id,
        after: { name: term.name },
      });

      return NextResponse.json({ data: { termId: term.id, isCurrent: true } });
    }

    const removed = await prisma.holiday.deleteMany({ where: { id: payload.holidayId } });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'holiday.delete',
      entity: 'Holiday',
      entityId: payload.holidayId,
    });

    return NextResponse.json({ data: { removed: removed.count } });
  } catch (error) {
    return fail(error, 'sessions PUT');
  }
}
