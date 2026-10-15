import { z } from 'zod';
import { NextResponse } from 'next/server';
import { fail, guard, limit, body, parseListQuery, listResponse } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { writeAudit } from '@/lib/audit';
import {
  saveMarks,
  submitExamForApproval,
  approveExamResults,
  publishExamResults,
  buildResultCard,
  studentPerformanceTrend,
  classSubjectPerformance,
  failedSubjectStudents,
  loadGradeScale,
} from '@/server/services/exams';
import { assertSubjectAccess, assertStudentAccess, getTeacherScope } from '@/server/auth-guard';
import { ExamStatus, Prisma, ResultStatus, Role } from '@prisma/client';
import { queueResultNotifications } from '@/server/notifications/events';

const marksSchema = z.object({
  examSubjectId: z.string().min(1),
  submit: z.boolean().default(false),
  marks: z
    .array(
      z.object({
        studentId: z.string().min(1),
        status: z.enum(['SCORED', 'ABSENT', 'EXEMPT', 'WITHHELD']),
        marksObtained: z.coerce.number().min(0).optional().nullable(),
        theoryMarks: z.coerce.number().min(0).optional().nullable(),
        practicalMarks: z.coerce.number().min(0).optional().nullable(),
        remarks: z.string().trim().max(300).optional().nullable(),
      }),
    )
    .min(1, 'Provide at least one student.'),
});

const workflowSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('submit'), examId: z.string().min(1) }),
  z.object({
    action: z.literal('approve'),
    examId: z.string().min(1),
    computeRanks: z.boolean().default(true),
  }),
  z.object({ action: z.literal('publish'), examId: z.string().min(1) }),
]);

/**
 * Read examinations, marks sheets, result cards and performance analytics.
 *
 * A published result is the only kind a student or guardian may read; that
 * check lives in the query, not in the interface.
 */
export async function GET(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.EXAM_VIEW);
    const query = parseListQuery(request);
    const scope = query.params.get('scope') ?? 'exams';

    if (scope === 'marksheet') {
      const examSubjectId = query.params.get('examSubjectId');
      if (!examSubjectId) {
        return NextResponse.json(
          { error: { code: 'VALIDATION', message: 'An exam subject is required.' } },
          { status: 422 },
        );
      }

      const examSubject = await prisma.examSubject.findUnique({
        where: { id: examSubjectId },
        select: {
          id: true,
          classSectionId: true,
          subjectId: true,
          maxMarks: true,
          passMarks: true,
          theoryMax: true,
          practicalMax: true,
          exam: { select: { id: true, name: true, resultStatus: true, examType: true } },
          subject: { select: { name: true, code: true } },
          classSection: { select: { name: true } },
        },
      });

      if (!examSubject) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Exam subject not found.' } },
          { status: 404 },
        );
      }

      await assertSubjectAccess(actor, examSubject.subjectId, examSubject.classSectionId);

      const enrollments = await prisma.enrollment.findMany({
        where: { classSectionId: examSubject.classSectionId, status: 'ACTIVE' },
        select: {
          student: {
            select: {
              id: true,
              admissionNo: true,
              firstName: true,
              lastName: true,
              rollNo: true,
            },
          },
        },
        orderBy: { student: { firstName: 'asc' } },
      });

      const results = await prisma.examResult.findMany({
        where: { examSubjectId },
        select: {
          studentId: true,
          status: true,
          marksObtained: true,
          theoryMarks: true,
          practicalMarks: true,
          percentage: true,
          grade: true,
          remarks: true,
        },
      });

      const resultByStudent = new Map(results.map((r) => [r.studentId, r]));

      return NextResponse.json({
        data: {
          examSubject,
          rows: enrollments.map((enrollment) => ({
            student: enrollment.student,
            result: resultByStudent.get(enrollment.student.id) ?? null,
          })),
        },
      });
    }

    if (scope === 'myExamSubjects') {
      // The picker for marks entry: exam subjects the actor may enter marks for,
      // grouped by examination. A teacher sees only their own subjects.
      const scopeIds = await getTeacherScope(actor);
      const examId = query.params.get('examId');

      const subjects = await prisma.examSubject.findMany({
        where: {
          ...(examId ? { examId } : {}),
          ...(actor.role === Role.ADMIN
            ? {}
            : {
                // Mirrors assertSubjectAccess: both the subject and the class
                // must be in scope, so the picker cannot offer a subject whose
                // marksheet would then be refused.
                subjectId: { in: scopeIds.subjectIds },
                classSectionId: { in: scopeIds.classSectionIds },
              }),
        },
        orderBy: [{ exam: { startDate: 'desc' } }, { subject: { name: 'asc' } }],
        take: query.take,
        select: {
          id: true,
          maxMarks: true,
          passMarks: true,
          subject: { select: { id: true, name: true, code: true } },
          classSection: { select: { id: true, name: true } },
          exam: {
            select: { id: true, name: true, examType: true, resultStatus: true, startDate: true },
          },
          _count: { select: { results: true } },
        },
      });

      return NextResponse.json({ data: subjects });
    }

    if (scope === 'resultcard') {
      const examId = query.params.get('examId');
      const studentId = query.params.get('studentId');

      if (!examId || !studentId) {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION',
              message: 'Both the examination and the student are required.',
            },
          },
          { status: 422 },
        );
      }

      await assertStudentAccess(actor, studentId, { forResult: true });

      const exam = await prisma.exam.findUnique({
        where: { id: examId },
        select: { resultStatus: true },
      });

      // An unpublished result must never reach a student or guardian.
      if (!exam) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Examination not found.' } },
          { status: 404 },
        );
      }

      if (exam.resultStatus !== ResultStatus.PUBLISHED && actor.role !== 'ADMIN') {
        return NextResponse.json(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'These results have not been published yet.',
            },
          },
          { status: 403 },
        );
      }

      return NextResponse.json({ data: await buildResultCard({ examId, studentId }) });
    }

    if (scope === 'trend') {
      const studentId = query.params.get('studentId');
      if (!studentId) {
        return NextResponse.json(
          { error: { code: 'VALIDATION', message: 'A student is required.' } },
          { status: 422 },
        );
      }

      await assertStudentAccess(actor, studentId, { forResult: true });

      return NextResponse.json({
        data: await studentPerformanceTrend(studentId, Number(query.params.get('limit') ?? 10)),
      });
    }

    if (scope === 'classPerformance') {
      const classSectionId = query.params.get('classSectionId');
      if (!classSectionId) {
        return NextResponse.json(
          { error: { code: 'VALIDATION', message: 'A class is required.' } },
          { status: 422 },
        );
      }

      return NextResponse.json({
        data: await classSubjectPerformance({ classSectionId }),
      });
    }

    if (scope === 'failed') {
      const examId = query.params.get('examId');
      if (!examId) {
        return NextResponse.json(
          { error: { code: 'VALIDATION', message: 'An examination is required.' } },
          { status: 422 },
        );
      }

      return NextResponse.json({ data: await failedSubjectStudents(examId) });
    }

    if (scope === 'gradescales') {
      const scales = await prisma.gradeScale.findMany({
        orderBy: { name: 'asc' },
        include: { bands: { orderBy: { minPercent: 'desc' } } },
      });
      return NextResponse.json({ data: { scales, default: await loadGradeScale(null) } });
    }

    // Default: examination list.
    const status = query.params.get('status');
    const resultStatus = query.params.get('resultStatus');

    const where: Prisma.ExamWhereInput = {
      ...(status ? { status: status as ExamStatus } : {}),
      ...(resultStatus ? { resultStatus: resultStatus as ResultStatus } : {}),
      ...(query.params.get('academicSessionId')
        ? { academicSessionId: query.params.get('academicSessionId') as string }
        : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.exam.findMany({
        where,
        orderBy: { startDate: 'desc' },
        skip: query.skip,
        take: query.take,
        select: {
          id: true,
          name: true,
          examType: true,
          status: true,
          resultStatus: true,
          startDate: true,
          endDate: true,
          publishedAt: true,
          academicSession: { select: { name: true } },
          _count: { select: { subjects: true } },
        },
      }),
      prisma.exam.count({ where }),
    ]);

    return listResponse(rows, total, query);
  } catch (error) {
    return fail(error, 'exams GET');
  }
}

/** Save a marks sheet, with optional submission for approval. */
export async function POST(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.MARKS_ENTER);
    await limit(request, 'exams:marks', 120, 60);

    const payload = await body(request, marksSchema);

    const examSubject = await prisma.examSubject.findUnique({
      where: { id: payload.examSubjectId },
      select: { subjectId: true, classSectionId: true },
    });

    if (!examSubject) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Exam subject not found.' } },
        { status: 404 },
      );
    }

    await assertSubjectAccess(actor, examSubject.subjectId, examSubject.classSectionId);

    const result = await saveMarks({
      examSubjectId: payload.examSubjectId,
      marks: payload.marks,
      enteredByUserId: actor.id,
      submit: payload.submit,
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: payload.submit ? 'marks.submit' : 'marks.save_draft',
      entity: 'ExamSubject',
      entityId: payload.examSubjectId,
      after: { entries: payload.marks.length, submitted: payload.submit },
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return fail(error, 'exams marks POST');
  }
}

/** Approval and publication workflow. */
export async function PUT(request: Request) {
  try {
    const payload = await body(request, workflowSchema);

    // Submitting is a teacher action; approving and publishing are not.
    const actor =
      payload.action === 'submit'
        ? await guard(PERMISSIONS.MARKS_ENTER)
        : await guard(PERMISSIONS.RESULT_PUBLISH);

    await limit(request, 'exams:workflow', 30, 60);

    if (payload.action === 'submit') {
      const result = await submitExamForApproval(payload.examId);
      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'exam.submit_for_approval',
        entity: 'Exam',
        entityId: payload.examId,
      });
      return NextResponse.json({ data: result });
    }

    if (payload.action === 'approve') {
      const result = await approveExamResults({
        examId: payload.examId,
        actorUserId: actor.id,
        computeRanks: payload.computeRanks,
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'exam.approve_results',
        entity: 'Exam',
        entityId: payload.examId,
        after: { computeRanks: payload.computeRanks },
      });

      return NextResponse.json({ data: result });
    }

    const result = await publishExamResults({
      examId: payload.examId,
      actorUserId: actor.id,
    });

    // Notify guardians of every enrolled student. Queuing is idempotent per
    // exam and student, so a retried request cannot double-message a parent.
    const notified = await queueResultNotifications({
      examId: result.examId,
      examName: result.examName,
      studentIds: result.studentIds,
      actorUserId: actor.id,
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'exam.publish',
      entity: 'Exam',
      entityId: payload.examId,
      after: { students: result.studentIds.length, notificationsQueued: notified },
    });

    return NextResponse.json({ data: { ...result, notificationsQueued: notified } });
  } catch (error) {
    return fail(error, 'exams workflow');
  }
}
