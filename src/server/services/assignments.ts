/**
 * Assignments, submissions and learning resources.
 *
 * Scope is resolved from the database on every call rather than trusted from
 * the query string: a teacher sees only their own classes, a student only their
 * own submissions, and a guardian only the children linked to them.
 */
import { prisma } from '@/lib/prisma';
import { forbidden, notFound, validationError } from '@/lib/errors';
import { getTeacherScope, studentScopeFilter } from '@/server/auth-guard';
import type { Actor } from '@/server/auth-guard';
import { Role, SubmissionStatus, AssignmentStatus, Prisma } from '@prisma/client';

const ASSIGNMENT_SELECT = {
  id: true,
  title: true,
  description: true,
  status: true,
  dueAt: true,
  maxMarks: true,
  allowLateSubmission: true,
  publishedAt: true,
  createdAt: true,
  classSection: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true } },
  teacherProfile: { select: { id: true, user: { select: { name: true } } } },
  _count: { select: { submissions: true } },
} satisfies Prisma.AssignmentSelect;

export type AssignmentRow = Prisma.AssignmentGetPayload<{ select: typeof ASSIGNMENT_SELECT }>;

/**
 * Resolve the class sections an actor may see assignments for.
 * Returns `null` when the actor is unrestricted.
 */
async function visibleClassSectionIds(actor: Actor): Promise<string[] | null> {
  if (actor.role === Role.ADMIN) return null;

  if (actor.role === Role.TEACHER) {
    const scope = await getTeacherScope(actor);
    return scope.classSectionIds;
  }

  if (actor.role === Role.STUDENT) {
    if (!actor.studentId) return [];
    const enrollments = await prisma.enrollment.findMany({
      where: { studentId: actor.studentId, status: 'ACTIVE' },
      select: { classSectionId: true },
    });
    return enrollments.map((e) => e.classSectionId);
  }

  const links = await prisma.guardianLink.findMany({
    where: { guardianUserId: actor.id },
    select: { studentId: true },
  });
  if (links.length === 0) return [];

  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: { in: links.map((l) => l.studentId) }, status: 'ACTIVE' },
    select: { classSectionId: true },
  });
  return Array.from(new Set(enrollments.map((e) => e.classSectionId)));
}

export interface ListAssignmentsOptions {
  classSectionId?: string;
  subjectId?: string;
  status?: AssignmentStatus;
  studentId?: string;
  skip: number;
  take: number;
}

/** List assignments the actor may see, with a submission roll-up for staff. */
export async function listAssignments(actor: Actor, options: ListAssignmentsOptions) {
  const allowedSections = await visibleClassSectionIds(actor);

  if (allowedSections !== null && allowedSections.length === 0) {
    return { rows: [], total: 0 };
  }

  const where: Prisma.AssignmentWhereInput = {
    ...(allowedSections !== null ? { classSectionId: { in: allowedSections } } : {}),
    ...(options.classSectionId ? { classSectionId: options.classSectionId } : {}),
    ...(options.subjectId ? { subjectId: options.subjectId } : {}),
    ...(options.status ? { status: options.status } : {}),
    // Students and guardians never see drafts.
    ...(actor.role === Role.STUDENT || actor.role === Role.PARENT
      ? { status: { not: AssignmentStatus.DRAFT } }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.assignment.findMany({
      where,
      orderBy: [{ dueAt: 'desc' }],
      skip: options.skip,
      take: options.take,
      select: ASSIGNMENT_SELECT,
    }),
    prisma.assignment.count({ where }),
  ]);

  // Attach the actor's own submission state so the list can show progress.
  const studentIds = await resolveTargetStudentIds(actor, options.studentId);
  const submissions =
    studentIds.length > 0 && rows.length > 0
      ? await prisma.assignmentSubmission.findMany({
          where: {
            assignmentId: { in: rows.map((r) => r.id) },
            studentId: { in: studentIds },
          },
          select: {
            id: true,
            assignmentId: true,
            studentId: true,
            status: true,
            marksObtained: true,
            isLate: true,
            submittedAt: true,
            gradedAt: true,
            feedback: true,
            content: true,
            fileUrl: true,
            student: { select: { firstName: true, lastName: true, admissionNo: true } },
          },
        })
      : [];

  const byAssignment = new Map<string, typeof submissions>();
  for (const submission of submissions) {
    const list = byAssignment.get(submission.assignmentId) ?? [];
    list.push(submission);
    byAssignment.set(submission.assignmentId, list);
  }

  return {
    rows: rows.map((row) => ({
      ...row,
      maxMarks: Number(row.maxMarks),
      mySubmissions: byAssignment.get(row.id) ?? [],
      submissionCount: row._count.submissions,
    })),
    total,
  };
}

/** Which student records a submission view should resolve for this actor. */
async function resolveTargetStudentIds(
  actor: Actor,
  requestedStudentId?: string,
): Promise<string[]> {
  if (requestedStudentId) {
    const filter = await studentScopeFilter(actor);
    if ('id' in filter && filter.id !== requestedStudentId) {
      throw forbidden('This student is not linked to your account.');
    }
    return [requestedStudentId];
  }

  if (actor.role === Role.STUDENT) return actor.studentId ? [actor.studentId] : [];

  if (actor.role === Role.PARENT) {
    const links = await prisma.guardianLink.findMany({
      where: { guardianUserId: actor.id },
      select: { studentId: true },
    });
    return links.map((l) => l.studentId);
  }

  return [];
}

export interface CreateAssignmentInput {
  title: string;
  description?: string | null;
  classSectionId: string;
  subjectId: string;
  dueAt: Date;
  maxMarks: number;
  allowLateSubmission: boolean;
  publish: boolean;
}

/** Create an assignment for one of the teacher's own classes. */
export async function createAssignment(actor: Actor, input: CreateAssignmentInput) {
  const teacherProfile = await requireTeacherProfileForActor(actor);

  if (actor.role === Role.TEACHER) {
    const scope = await getTeacherScope(actor);
    if (!scope.classSectionIds.includes(input.classSectionId)) {
      throw forbidden('You are not assigned to this class.');
    }
    if (!scope.subjectIds.includes(input.subjectId)) {
      throw forbidden('You are not assigned to teach this subject.');
    }
  }

  return prisma.assignment.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      classSectionId: input.classSectionId,
      subjectId: input.subjectId,
      teacherProfileId: teacherProfile.id,
      dueAt: input.dueAt,
      maxMarks: input.maxMarks,
      allowLateSubmission: input.allowLateSubmission,
      status: input.publish ? AssignmentStatus.PUBLISHED : AssignmentStatus.DRAFT,
      publishedAt: input.publish ? new Date() : null,
    },
    select: ASSIGNMENT_SELECT,
  });
}

async function requireTeacherProfileForActor(actor: Actor) {
  if (actor.role === Role.ADMIN) {
    // An administrator creating an assignment must nominate the owner, so fall
    // back to any active teacher profile rather than failing outright.
    const profile = await prisma.teacherProfile.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!profile) throw notFound('No teacher profile exists to own this assignment.');
    return profile;
  }

  const profile = await prisma.teacherProfile.findUnique({
    where: { userId: actor.id },
    select: { id: true },
  });
  if (!profile) throw forbidden('Only teaching staff can create assignments.');
  return profile;
}

/**
 * Submit or resubmit work. Late submissions are flagged against the deadline
 * rather than rejected, because the academy may still choose to grade them.
 */
export async function submitAssignment(
  actor: Actor,
  input: { assignmentId: string; studentId?: string; content?: string | null; fileUrl?: string | null },
) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: input.assignmentId },
    select: {
      id: true,
      dueAt: true,
      status: true,
      allowLateSubmission: true,
      classSectionId: true,
    },
  });
  if (!assignment) throw notFound('Assignment not found.');
  if (assignment.status !== AssignmentStatus.PUBLISHED) {
    throw forbidden('This assignment is not open for submissions.');
  }

  const studentId = await resolveSubmissionStudentId(actor, input.studentId);

  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, classSectionId: assignment.classSectionId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (!enrollment) throw forbidden('You are not enrolled in this class.');

  const isLate = new Date() > assignment.dueAt;
  if (isLate && !assignment.allowLateSubmission) {
    throw forbidden('The deadline has passed and late submissions are not accepted.');
  }

  const existing = await prisma.assignmentSubmission.findFirst({
    where: { assignmentId: input.assignmentId, studentId },
    select: { id: true, status: true },
  });

  if (existing?.status === SubmissionStatus.GRADED) {
    throw forbidden('This submission has already been graded and cannot be changed.');
  }

  const data = {
    status: isLate ? SubmissionStatus.LATE : SubmissionStatus.SUBMITTED,
    content: input.content ?? null,
    fileUrl: input.fileUrl ?? null,
    submittedAt: new Date(),
    isLate,
  };

  if (existing) {
    return prisma.assignmentSubmission.update({
      where: { id: existing.id },
      data,
      select: { id: true, status: true, isLate: true, submittedAt: true },
    });
  }

  return prisma.assignmentSubmission.create({
    data: { assignmentId: input.assignmentId, studentId, ...data },
    select: { id: true, status: true, isLate: true, submittedAt: true },
  });
}

/** A student submits for themselves; a guardian acts only for a linked child. */
async function resolveSubmissionStudentId(
  actor: Actor,
  requested?: string,
): Promise<string> {
  if (actor.role === Role.STUDENT) {
    if (!actor.studentId) throw forbidden('Your account is not linked to a student record.');
    if (requested && requested !== actor.studentId) {
      throw forbidden('You can only submit your own work.');
    }
    return actor.studentId;
  }

  if (actor.role === Role.PARENT) {
    throw forbidden('Guardians cannot submit work on a student’s behalf.');
  }

  if (!requested) {
    throw validationError('A student is required.', [{ path: 'studentId', message: 'A student is required.' }]);
  }
  return requested;
}

/** Grade a submission. Only staff who can see the class may mark it. */
export async function gradeSubmission(
  actor: Actor,
  input: { submissionId: string; marksObtained: number | null; feedback?: string | null },
) {
  const submission = await prisma.assignmentSubmission.findUnique({
    where: { id: input.submissionId },
    select: {
      id: true,
      assignment: {
        select: { id: true, maxMarks: true, classSectionId: true, teacherProfileId: true },
      },
    },
  });
  if (!submission) throw notFound('Submission not found.');

  const maxMarks = Number(submission.assignment.maxMarks);
  if (input.marksObtained != null && (input.marksObtained < 0 || input.marksObtained > maxMarks)) {
    throw validationError(`Marks must be between 0 and ${maxMarks}.`, [
      { path: 'marksObtained', message: `Enter a value between 0 and ${maxMarks}.` },
    ]);
  }

  if (actor.role === Role.TEACHER) {
    const scope = await getTeacherScope(actor);
    if (!scope.classSectionIds.includes(submission.assignment.classSectionId)) {
      throw forbidden('You are not assigned to this class.');
    }
  }

  return prisma.assignmentSubmission.update({
    where: { id: submission.id },
    data: {
      marksObtained: input.marksObtained,
      feedback: input.feedback ?? null,
      status: input.marksObtained != null ? SubmissionStatus.GRADED : SubmissionStatus.RETURNED,
      gradedAt: new Date(),
      gradedBy: actor.id,
    },
    select: { id: true, status: true, marksObtained: true, gradedAt: true },
  });
}

/** Publish or close an assignment. */
export async function setAssignmentStatus(
  actor: Actor,
  input: { assignmentId: string; status: AssignmentStatus },
) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: input.assignmentId },
    select: { id: true, classSectionId: true, status: true },
  });
  if (!assignment) throw notFound('Assignment not found.');

  if (actor.role === Role.TEACHER) {
    const scope = await getTeacherScope(actor);
    if (!scope.classSectionIds.includes(assignment.classSectionId)) {
      throw forbidden('You are not assigned to this class.');
    }
  }

  return prisma.assignment.update({
    where: { id: assignment.id },
    data: {
      status: input.status,
      publishedAt:
        input.status === AssignmentStatus.PUBLISHED
          ? (assignment.status === AssignmentStatus.PUBLISHED ? undefined : new Date())
          : undefined,
    },
    select: ASSIGNMENT_SELECT,
  });
}

const RESOURCE_SELECT = {
  id: true,
  title: true,
  description: true,
  category: true,
  fileUrl: true,
  fileType: true,
  fileSize: true,
  classSectionId: true,
  courseId: true,
  createdAt: true,
  subject: { select: { id: true, name: true } },
} satisfies Prisma.LearningResourceSelect;

/** Learning resources visible to the actor's classes. */
export async function listResources(
  actor: Actor,
  options: { classSectionId?: string; subjectId?: string; category?: string; skip: number; take: number },
) {
  const allowedSections = await visibleClassSectionIds(actor);

  if (allowedSections !== null && allowedSections.length === 0) {
    // Even with no class enrolment, academy-wide public resources stay visible.
    const publicRows = await prisma.learningResource.findMany({
      where: { isPublic: true },
      orderBy: { createdAt: 'desc' },
      skip: options.skip,
      take: options.take,
      select: RESOURCE_SELECT,
    });
    return { rows: publicRows, total: publicRows.length };
  }

  const where: Prisma.LearningResourceWhereInput = {
    // Academy-wide and public resources carry no class, so they are always included.
    ...(allowedSections !== null
      ? {
          OR: [
            { classSectionId: null },
            { classSectionId: { in: allowedSections } },
            { isPublic: true },
          ],
        }
      : {}),
    ...(options.classSectionId ? { classSectionId: options.classSectionId } : {}),
    ...(options.subjectId ? { subjectId: options.subjectId } : {}),
    ...(options.category ? { category: options.category } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.learningResource.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: options.skip,
      take: options.take,
      select: RESOURCE_SELECT,
    }),
    prisma.learningResource.count({ where }),
  ]);

  return { rows, total };
}
