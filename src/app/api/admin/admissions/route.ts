import { z } from 'zod';
import { NextResponse } from 'next/server';
import { fail, guard, limit, body, parseListQuery, listResponse } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { writeAudit } from '@/lib/audit';
import { conflict, notFound } from '@/lib/errors';
import { dedupeKeys, enqueueNotification } from '@/server/notifications/queue';
import { getAcademyProfile } from '@/server/settings';
import { AdmissionStatus, Prisma } from '@prisma/client';

const decisionSchema = z.object({
  applicationId: z.string().min(1),
  decision: z.enum(['UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'WAITLISTED', 'WITHDRAWN']),
  requestedClass: z.string().trim().max(120).optional().nullable(),
  reviewNotes: z.string().trim().max(1000).optional().nullable(),
});

/**
 * Admission application review.
 *
 * An administrator moves an application through the review workflow. Accepting
 * an application does not create a student record here: enrolment is a separate
 * action so a reviewer cannot accidentally admit someone without the required
 * academic placement data.
 */
export async function GET(request: Request) {
  try {
    await guard(PERMISSIONS.APPLICATION_VIEW);
    const query = parseListQuery(request);
    const status = query.params.get('status');

    const where: Prisma.AdmissionApplicationWhereInput = {
      ...(status ? { status: status as AdmissionStatus } : {}),
      ...(query.search
        ? {
            OR: [
              { applicationNo: { contains: query.search, mode: 'insensitive' } },
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { guardianName: { contains: query.search, mode: 'insensitive' } },
              { guardianPhone: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total, byStatus] = await Promise.all([
      prisma.admissionApplication.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
        select: {
          id: true,
          applicationNo: true,
          firstName: true,
          lastName: true,
          gender: true,
          dateOfBirth: true,
          guardianName: true,
          guardianPhone: true,
          guardianEmail: true,
          guardianRelation: true,
          requestedClass: true,
          previousSchool: true,
          previousGrade: true,
          status: true,
          source: true,
          trialClassRequested: true,
          reviewNotes: true,
          reviewedAt: true,
          createdAt: true,
          course: { select: { id: true, name: true, code: true } },
        },
      }),
      prisma.admissionApplication.count({ where }),
      prisma.admissionApplication.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    return listResponse(
      rows,
      total,
      Object.assign(query, {
        counts: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
      }) as typeof query,
    );
  } catch (error) {
    return fail(error, 'admissions admin GET');
  }
}

/** Record a review decision and tell the applicant. */
export async function PUT(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.APPLICATION_REVIEW);
    await limit(request, 'admissions:review', 60, 60);

    const payload = await body(request, decisionSchema);

    const application = await prisma.admissionApplication.findUnique({
      where: { id: payload.applicationId },
    });

    if (!application) throw notFound('Application not found.');

    if (application.status === AdmissionStatus.ACCEPTED && payload.decision === 'ACCEPTED') {
      throw conflict('This application has already been accepted.');
    }

    if (application.status === AdmissionStatus.REJECTED && payload.decision === 'ACCEPTED') {
      throw conflict('A rejected application cannot be accepted directly. Reopen it first.');
    }

    const updated = await prisma.admissionApplication.update({
      where: { id: payload.applicationId },
      data: {
        status: payload.decision,
        reviewNotes: payload.reviewNotes ?? null,
        reviewedAt: new Date(),
        reviewedBy: actor.id,
      },
      select: {
        id: true,
        applicationNo: true,
        status: true,
        firstName: true,
        lastName: true,
        guardianName: true,
        guardianPhone: true,
        reviewedAt: true,
        guardianEmail: true,
      },
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'admission.review',
      entity: 'AdmissionApplication',
      entityId: updated.id,
      before: { status: application.status },
      after: { status: updated.status, reviewNotes: payload.reviewNotes ?? null },
    });

    // Inform the applicant. Best-effort: a messaging failure must not undo a
    // decision that has already been recorded.
    try {
      const profile = await getAcademyProfile();

      await enqueueNotification({
        category: 'ADMISSION_UPDATE',
        dedupeKey: dedupeKeys.admissionUpdate(updated.id, updated.status),
        recipientPhone: updated.guardianPhone ?? '',
        templateKey: 'admission_decision',
        context: {
          guardianName: updated.guardianName ?? 'Parent/Guardian',
          studentName: `${updated.firstName} ${updated.lastName}`.trim(),
          status: updated.status.replace('_', ' ').toLowerCase(),
          academyName: profile.name,
        },
        payload: { applicationId: updated.id, decision: updated.status },
        createdByUserId: actor.id,
      });
    } catch (notificationError) {
      console.error('[admissions] decision notification failed to queue:', notificationError);
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    return fail(error, 'admissions admin PUT');
  }
}
