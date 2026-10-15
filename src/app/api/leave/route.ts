import { z } from 'zod';
import { NextResponse } from 'next/server';
import { fail, guard, limit, body, parseListQuery, listResponse } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { forbidden } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { Role, LeaveStatus, LeaveType, Prisma } from '@prisma/client';

const createSchema = z.object({
  leaveType: z.enum(['SICK', 'CASUAL', 'PERSONAL', 'EMERGENCY', 'OTHER']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format.'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format.'),
  reason: z.string().trim().max(1000).optional().nullable(),
});

/**
 * Leave requests.
 *
 * A teacher sees and files only their own requests. Administrators see every
 * request and are the only role that may approve or reject one.
 */
export async function GET(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.ACADEMY_VIEW);
    const query = parseListQuery(request);

    if (actor.role !== Role.ADMIN && !actor.teacherProfileId) {
      // Students and guardians have no staff leave record.
      return listResponse([], 0, query);
    }

    const status = query.params.get('status');

    const where: Prisma.LeaveRequestWhereInput = {
      ...(actor.role === Role.ADMIN
        ? query.params.get('teacherProfileId')
          ? { teacherProfileId: query.params.get('teacherProfileId')! }
          : {}
        : { teacherProfileId: actor.teacherProfileId! }),
      ...(status ? { status: status as LeaveStatus } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        orderBy: [{ startDate: 'desc' }],
        skip: query.skip,
        take: query.take,
        select: {
          id: true,
          leaveType: true,
          startDate: true,
          endDate: true,
          reason: true,
          status: true,
          reviewNotes: true,
          reviewedAt: true,
          createdAt: true,
          teacherProfile: { select: { user: { select: { name: true } } } },
        },
      }),
      prisma.leaveRequest.count({ where }),
    ]);

    return listResponse(rows, total, query);
  } catch (error) {
    return fail(error, 'leave GET');
  }
}

export async function POST(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.ACADEMY_VIEW);
    await limit(request, 'leave:create', 20, 60);

    if (!actor.teacherProfileId) {
      throw forbidden('Only teaching staff can request leave.');
    }

    const payload = await body(request, createSchema);

    const start = new Date(`${payload.startDate}T00:00:00.000Z`);
    const end = new Date(`${payload.endDate}T00:00:00.000Z`);
    if (end < start) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message: 'The end date cannot fall before the start date.',
            details: [{ path: 'endDate', message: 'Choose a date on or after the start date.' }],
          },
        },
        { status: 422 },
      );
    }

    const leave = await prisma.leaveRequest.create({
      data: {
        teacherProfileId: actor.teacherProfileId,
        leaveType: payload.leaveType as LeaveType,
        startDate: start,
        endDate: end,
        reason: payload.reason ?? null,
      },
      select: {
        id: true,
        leaveType: true,
        startDate: true,
        endDate: true,
        status: true,
      },
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'leave.request',
      entity: 'LeaveRequest',
      entityId: leave.id,
      after: { leaveType: leave.leaveType, startDate: payload.startDate, endDate: payload.endDate },
    });

    return NextResponse.json({ data: leave }, { status: 201 });
  } catch (error) {
    return fail(error, 'leave POST');
  }
}

const reviewSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['APPROVED', 'REJECTED', 'CANCELLED']),
  reviewNotes: z.string().trim().max(1000).optional().nullable(),
});

/** Approve, reject or cancel a request. Administrators only. */
export async function PATCH(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.ACADEMY_VIEW);

    if (actor.role !== Role.ADMIN) {
      throw forbidden('Only an administrator can review leave requests.');
    }

    const payload = await body(request, reviewSchema);

    const leave = await prisma.leaveRequest.update({
      where: { id: payload.id },
      data: {
        status: payload.status as LeaveStatus,
        reviewNotes: payload.reviewNotes ?? null,
        reviewedBy: actor.id,
        reviewedAt: new Date(),
      },
      select: { id: true, status: true, reviewedAt: true },
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'leave.review',
      entity: 'LeaveRequest',
      entityId: leave.id,
      after: { status: leave.status },
    });

    return NextResponse.json({ data: leave });
  } catch (error) {
    return fail(error, 'leave PATCH');
  }
}
