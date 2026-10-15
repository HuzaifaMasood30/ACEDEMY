import { z } from 'zod';
import { NextResponse } from 'next/server';
import { fail, guard, limit, body, parseListQuery, listResponse } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import { writeAudit } from '@/lib/audit';
import {
  createAssignment,
  gradeSubmission,
  listAssignments,
  setAssignmentStatus,
  submitAssignment,
} from '@/server/services/assignments';
import { queueAssignmentNotifications } from '@/server/notifications/events';
import { AssignmentStatus } from '@prisma/client';

const createSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  classSectionId: z.string().min(1),
  subjectId: z.string().min(1),
  dueAt: z.coerce.date(),
  maxMarks: z.coerce.number().positive().max(1000).default(100),
  allowLateSubmission: z.boolean().default(true),
  publish: z.boolean().default(false),
});

const submitSchema = z.object({
  action: z.literal('submit'),
  assignmentId: z.string().min(1),
  studentId: z.string().min(1).optional(),
  content: z.string().trim().max(8000).optional().nullable(),
  fileUrl: z.string().trim().max(2000).optional().nullable(),
});

const gradeSchema = z.object({
  action: z.literal('grade'),
  submissionId: z.string().min(1),
  marksObtained: z.coerce.number().min(0).optional().nullable(),
  feedback: z.string().trim().max(4000).optional().nullable(),
});

const statusSchema = z.object({
  action: z.literal('status'),
  assignmentId: z.string().min(1),
  status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']),
});

/**
 * Assignments and submissions.
 *
 * Reading is scoped to the actor's classes; writing requires the matching
 * permission and is re-checked against the database inside the service.
 */
export async function GET(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.ASSIGNMENT_VIEW);
    const query = parseListQuery(request);

    const { rows, total } = await listAssignments(actor, {
      classSectionId: query.params.get('classSectionId') ?? undefined,
      subjectId: query.params.get('subjectId') ?? undefined,
      status: (query.params.get('status') as AssignmentStatus | null) ?? undefined,
      studentId: query.params.get('studentId') ?? undefined,
      skip: query.skip,
      take: query.take,
    });

    return listResponse(rows, total, query);
  } catch (error) {
    return fail(error, 'assignments GET');
  }
}

export async function POST(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.ASSIGNMENT_CREATE);
    await limit(request, 'assignments:create', 60, 60);

    const payload = await body(request, createSchema);

    const assignment = await createAssignment(actor, {
      ...payload,
      description: payload.description ?? null,
    });

    let notifications = null;
    if (payload.publish) {
      notifications = await queueAssignmentNotifications({
        assignmentId: assignment.id,
        assignmentTitle: assignment.title,
        subjectName: assignment.subject.name,
        deadline: assignment.dueAt,
        classSectionId: assignment.classSection.id,
        createdByUserId: actor.id,
      });
    }

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'assignment.create',
      entity: 'Assignment',
      entityId: assignment.id,
      after: { title: assignment.title, status: assignment.status },
    });

    return NextResponse.json({ data: { assignment, notifications } }, { status: 201 });
  } catch (error) {
    return fail(error, 'assignments POST');
  }
}

/** Submissions, grading and status changes, dispatched on `action`. */
export async function PATCH(request: Request) {
  try {
    const raw = (await request.clone().json()) as { action?: string };
    const action = raw?.action;

    if (action === 'submit') {
      const actor = await guard(PERMISSIONS.ASSIGNMENT_VIEW);
      await limit(request, 'assignments:submit', 120, 60);
      const payload = await body(request, submitSchema);
      const submission = await submitAssignment(actor, payload);
      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'assignment.submit',
        entity: 'AssignmentSubmission',
        entityId: submission.id,
        after: { status: submission.status, isLate: submission.isLate },
      });
      return NextResponse.json({ data: submission });
    }

    if (action === 'grade') {
      const actor = await guard(PERMISSIONS.ASSIGNMENT_GRADE);
      const payload = await body(request, gradeSchema);
      const submission = await gradeSubmission(actor, {
        submissionId: payload.submissionId,
        marksObtained: payload.marksObtained ?? null,
        feedback: payload.feedback ?? null,
      });
      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'assignment.grade',
        entity: 'AssignmentSubmission',
        entityId: submission.id,
        after: { marks: payload.marksObtained ?? null },
      });
      return NextResponse.json({ data: submission });
    }

    if (action === 'status') {
      const actor = await guard(PERMISSIONS.ASSIGNMENT_CREATE);
      const payload = await body(request, statusSchema);
      const assignment = await setAssignmentStatus(actor, payload);

      let notifications = null;
      if (payload.status === 'PUBLISHED') {
        notifications = await queueAssignmentNotifications({
          assignmentId: assignment.id,
          assignmentTitle: assignment.title,
          subjectName: assignment.subject.name,
          deadline: assignment.dueAt,
          classSectionId: assignment.classSection.id,
          createdByUserId: actor.id,
        });
      }

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'assignment.status',
        entity: 'Assignment',
        entityId: assignment.id,
        after: { status: assignment.status },
      });

      return NextResponse.json({ data: { assignment, notifications } });
    }

    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Unknown action. Use "submit", "grade" or "status".',
        },
      },
      { status: 422 },
    );
  } catch (error) {
    return fail(error, 'assignments PATCH');
  }
}
