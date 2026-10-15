import { z } from 'zod';
import { NextResponse } from 'next/server';
import { fail, guard, limit, body } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { writeAudit } from '@/lib/audit';
import { notFound } from '@/lib/errors';
import { ExamStatus, ExamType, Prisma, ResultStatus } from '@prisma/client';

/**
 * Examination planning: creating an exam, attaching the subjects it covers and
 * moving it through the draft → scheduled → completed lifecycle.
 *
 * Marks entry, approval and publication live in the sibling `/api/admin/exams`
 * route, because those carry a different permission and a different audit trail.
 */

const createSchema = z.object({
  action: z.literal('create'),
  name: z.string().trim().min(2).max(120),
  examType: z.nativeEnum(ExamType),
  academicSessionId: z.string().min(1),
  termId: z.string().min(1).optional().nullable(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  classSectionIds: z.array(z.string().min(1)).min(1, 'Choose at least one class.'),
  instructions: z.string().trim().max(2000).optional().nullable(),
  /** Subject ids to attach, expanded across every selected class. */
  subjectIds: z.array(z.string().min(1)).default([]),
  maxMarks: z.coerce.number().min(1).max(1000).default(100),
  passMarks: z.coerce.number().min(0).max(1000).default(40),
});

const updateSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('update'),
    examId: z.string().min(1),
    values: z.object({
      name: z.string().trim().min(2).max(120).optional(),
      startDate: z.coerce.date().optional(),
      endDate: z.coerce.date().optional(),
      status: z.nativeEnum(ExamStatus).optional(),
      instructions: z.string().trim().max(2000).nullable().optional(),
    }),
  }),
  z.object({
    action: z.literal('addSubject'),
    examId: z.string().min(1),
    subjectId: z.string().min(1),
    classSectionId: z.string().min(1),
    maxMarks: z.coerce.number().min(1).max(1000).default(100),
    passMarks: z.coerce.number().min(0).max(1000).default(40),
    examDate: z.coerce.date().optional().nullable(),
  }),
  z.object({
    action: z.literal('removeSubject'),
    examSubjectId: z.string().min(1),
  }),
  z.object({
    action: z.literal('delete'),
    examId: z.string().min(1),
  }),
]);

export async function GET(request: Request) {
  try {
    await guard(PERMISSIONS.EXAM_VIEW);
    const url = new URL(request.url);

    const examId = url.searchParams.get('examId');
    if (examId) {
      const exam = await prisma.exam.findUnique({
        where: { id: examId },
        select: {
          id: true,
          name: true,
          examType: true,
          status: true,
          resultStatus: true,
          startDate: true,
          endDate: true,
          publishedAt: true,
          instructions: true,
          classSectionIds: true,
          academicSessionId: true,
          termId: true,
          academicSession: { select: { id: true, name: true } },
          term: { select: { id: true, name: true } },
          subjects: {
            orderBy: [{ classSection: { name: 'asc' } }, { subject: { name: 'asc' } }],
            select: {
              id: true,
              maxMarks: true,
              passMarks: true,
              examDate: true,
              subject: { select: { id: true, name: true, code: true } },
              classSection: { select: { id: true, name: true } },
              gradeScale: { select: { id: true, name: true } },
              _count: { select: { results: true } },
            },
          },
        },
      });

      if (!exam) throw notFound('Examination not found.');
      return NextResponse.json({ data: exam });
    }

    const [sessions, terms, classes, subjects, gradeScales] = await Promise.all([
      prisma.academicSession.findMany({
        orderBy: { startDate: 'desc' },
        select: { id: true, name: true, isCurrent: true },
      }),
      prisma.term.findMany({
        orderBy: { startDate: 'desc' },
        select: { id: true, name: true, academicSessionId: true },
      }),
      prisma.classSection.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          courseId: true,
          course: { select: { name: true } },
          _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
        },
      }),
      prisma.subject.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true },
      }),
      prisma.gradeScale.findMany({
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        select: { id: true, name: true, isDefault: true },
      }),
    ]);

    return NextResponse.json({ data: { sessions, terms, classes, subjects, gradeScales } });
  } catch (error) {
    return fail(error, 'exam manage GET');
  }
}

export async function POST(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.EXAM_MANAGE);
    await limit(request, 'exams:manage', 30, 60);

    const payload = await body(request, createSchema);

    if (payload.endDate < payload.startDate) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'The end date cannot precede the start date.' } },
        { status: 422 },
      );
    }

    const session = await prisma.academicSession.findUnique({
      where: { id: payload.academicSessionId },
      select: { id: true },
    });
    if (!session) throw notFound('Academic session not found.');

    const defaultScale = await prisma.gradeScale.findFirst({
      where: { isDefault: true },
      select: { id: true },
    });

    const exam = await prisma.$transaction(async (tx) => {
      const created = await tx.exam.create({
        data: {
          name: payload.name,
          examType: payload.examType,
          academicSessionId: payload.academicSessionId,
          termId: payload.termId ?? null,
          startDate: payload.startDate,
          endDate: payload.endDate,
          classSectionIds: payload.classSectionIds,
          instructions: payload.instructions ?? null,
          status: ExamStatus.SCHEDULED,
          createdBy: actor.id,
        },
        select: { id: true, name: true },
      });

      if (payload.subjectIds.length > 0) {
        await tx.examSubject.createMany({
          data: payload.classSectionIds.flatMap((classSectionId) =>
            payload.subjectIds.map((subjectId) => ({
              examId: created.id,
              subjectId,
              classSectionId,
              maxMarks: payload.maxMarks,
              passMarks: payload.passMarks,
              gradeScaleId: defaultScale?.id ?? null,
            })),
          ),
          skipDuplicates: true,
        });
      }

      return created;
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'exam.create',
      entity: 'Exam',
      entityId: exam.id,
      after: {
        name: exam.name,
        examType: payload.examType,
        classes: payload.classSectionIds.length,
        subjects: payload.subjectIds.length,
      },
    });

    return NextResponse.json({ data: exam }, { status: 201 });
  } catch (error) {
    return fail(error, 'exam manage POST');
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.EXAM_MANAGE);
    await limit(request, 'exams:manage:update', 60, 60);

    const payload = await body(request, updateSchema);

    if (payload.action === 'addSubject') {
      const exam = await prisma.exam.findUnique({
        where: { id: payload.examId },
        select: { id: true, resultStatus: true },
      });
      if (!exam) throw notFound('Examination not found.');

      if (exam.resultStatus !== ResultStatus.DRAFT) {
        return NextResponse.json(
          {
            error: {
              code: 'CONFLICT',
              message: 'Subjects cannot be changed once results leave the draft stage.',
            },
          },
          { status: 409 },
        );
      }

      const defaultScale = await prisma.gradeScale.findFirst({
        where: { isDefault: true },
        select: { id: true },
      });

      const created = await prisma.examSubject.upsert({
        where: {
          examId_subjectId_classSectionId: {
            examId: payload.examId,
            subjectId: payload.subjectId,
            classSectionId: payload.classSectionId,
          },
        },
        create: {
          examId: payload.examId,
          subjectId: payload.subjectId,
          classSectionId: payload.classSectionId,
          maxMarks: payload.maxMarks,
          passMarks: payload.passMarks,
          examDate: payload.examDate ?? null,
          gradeScaleId: defaultScale?.id ?? null,
        },
        update: {
          maxMarks: payload.maxMarks,
          passMarks: payload.passMarks,
          examDate: payload.examDate ?? null,
        },
        select: { id: true },
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'exam_subject.upsert',
        entity: 'ExamSubject',
        entityId: created.id,
        after: { examId: payload.examId, subjectId: payload.subjectId },
      });

      return NextResponse.json({ data: created });
    }

    if (payload.action === 'removeSubject') {
      const examSubject = await prisma.examSubject.findUnique({
        where: { id: payload.examSubjectId },
        select: { id: true, examId: true, _count: { select: { results: true } } },
      });
      if (!examSubject) throw notFound('Exam subject not found.');

      if (examSubject._count.results > 0) {
        return NextResponse.json(
          {
            error: {
              code: 'CONFLICT',
              message:
                'Marks have already been entered for this subject. Remove them before detaching it.',
            },
          },
          { status: 409 },
        );
      }

      await prisma.examSubject.delete({ where: { id: payload.examSubjectId } });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'exam_subject.remove',
        entity: 'ExamSubject',
        entityId: payload.examSubjectId,
        before: { examId: examSubject.examId },
      });

      return NextResponse.json({ data: { id: payload.examSubjectId } });
    }

    if (payload.action === 'delete') {
      const exam = await prisma.exam.findUnique({
        where: { id: payload.examId },
        select: {
          id: true,
          name: true,
          resultStatus: true,
          _count: { select: { subjects: true } },
        },
      });
      if (!exam) throw notFound('Examination not found.');

      if (exam.resultStatus !== ResultStatus.DRAFT) {
        return NextResponse.json(
          {
            error: {
              code: 'CONFLICT',
              message: 'An examination with approved or published results cannot be deleted.',
            },
          },
          { status: 409 },
        );
      }

      const results = await prisma.examResult.count({
        where: { examSubject: { examId: payload.examId } },
      });

      if (results > 0) {
        return NextResponse.json(
          {
            error: {
              code: 'CONFLICT',
              message: `${results} mark entries exist for this examination. Delete is blocked to protect academic records.`,
            },
          },
          { status: 409 },
        );
      }

      await prisma.exam.delete({ where: { id: payload.examId } });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'exam.delete',
        entity: 'Exam',
        entityId: exam.id,
        before: { name: exam.name, subjects: exam._count.subjects },
      });

      return NextResponse.json({ data: { id: exam.id } });
    }

    const existing = await prisma.exam.findUnique({
      where: { id: payload.examId },
      select: { id: true, status: true, startDate: true, endDate: true },
    });
    if (!existing) throw notFound('Examination not found.');

    const start = payload.values.startDate ?? existing.startDate;
    const end = payload.values.endDate ?? existing.endDate;
    if (end < start) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'The end date cannot precede the start date.' } },
        { status: 422 },
      );
    }

    const updated = await prisma.exam.update({
      where: { id: payload.examId },
      data: {
        ...(payload.values.name !== undefined ? { name: payload.values.name } : {}),
        ...(payload.values.startDate !== undefined ? { startDate: payload.values.startDate } : {}),
        ...(payload.values.endDate !== undefined ? { endDate: payload.values.endDate } : {}),
        ...(payload.values.status !== undefined ? { status: payload.values.status } : {}),
        ...(payload.values.instructions !== undefined
          ? { instructions: payload.values.instructions }
          : {}),
      },
      select: { id: true, name: true, status: true, startDate: true, endDate: true },
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'exam.update',
      entity: 'Exam',
      entityId: updated.id,
      before: { status: existing.status },
      after: payload.values as Prisma.InputJsonValue,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return fail(error, 'exam manage PUT');
  }
}
