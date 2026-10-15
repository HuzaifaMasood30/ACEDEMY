import { prisma } from '@/lib/prisma';
import { conflict, notFound, validationError } from '@/lib/errors';
import { MarksEntryStatus, ResultStatus } from '@prisma/client';
import { round2 } from './fees';

/* --------------------------------------------------------------------------
   Grading
   -------------------------------------------------------------------------- */

export interface GradeBandLike {
  grade: string;
  minPercent: number;
  maxPercent: number;
  gpa: number | null;
  remark: string | null;
}

/**
 * Resolve a percentage to a grade band.
 *
 * Bands are matched inclusively on the lower bound and exclusively on the
 * upper bound, except for the top band, so 90% falls in "A" when the band is
 * 90–100 rather than falling through to nothing.
 */
export function resolveGrade(
  percentage: number,
  bands: GradeBandLike[],
): GradeBandLike | null {
  if (bands.length === 0) return null;

  const sorted = [...bands].sort((a, b) => b.minPercent - a.minPercent);
  const top = sorted[0];

  for (const band of sorted) {
    const isTop = band === top;
    if (percentage >= band.minPercent && (percentage <= band.maxPercent || isTop)) {
      return band;
    }
  }

  // Below the lowest band: return the lowest band so a mark is never gradeless.
  return sorted[sorted.length - 1] ?? null;
}

export async function loadGradeScale(gradeScaleId?: string | null) {
  const scale = gradeScaleId
    ? await prisma.gradeScale.findUnique({
        where: { id: gradeScaleId },
        include: { bands: true },
      })
    : await prisma.gradeScale.findFirst({
        where: { isDefault: true },
        include: { bands: true },
      });

  if (!scale) return null;

  return {
    id: scale.id,
    name: scale.name,
    bands: scale.bands.map((band) => ({
      grade: band.grade,
      minPercent: Number(band.minPercent.toString()),
      maxPercent: Number(band.maxPercent.toString()),
      gpa: band.gpa === null ? null : Number(band.gpa.toString()),
      remark: band.remark,
    })),
  };
}

/**
 * Compute derived fields for one mark.
 *
 * Absent, exempt and withheld results carry no percentage or grade — showing a
 * zero for an absent student would misrepresent their performance.
 */
export function computeMarkDerived(options: {
  marksObtained: number | null;
  maxMarks: number;
  status: MarksEntryStatus;
  bands: GradeBandLike[];
}) {
  if (options.status !== MarksEntryStatus.SCORED || options.marksObtained === null) {
    return { percentage: null, grade: null, gpa: null };
  }

  if (options.maxMarks <= 0) {
    return { percentage: null, grade: null, gpa: null };
  }

  const percentage = round2((options.marksObtained / options.maxMarks) * 100);
  const band = resolveGrade(percentage, options.bands);

  return {
    percentage,
    grade: band?.grade ?? null,
    gpa: band?.gpa ?? null,
  };
}

/* --------------------------------------------------------------------------
   Marks entry
   -------------------------------------------------------------------------- */

export interface MarkInput {
  studentId: string;
  marksObtained?: number | null;
  theoryMarks?: number | null;
  practicalMarks?: number | null;
  status: MarksEntryStatus;
  remarks?: string | null;
}

export interface SaveMarksInput {
  examSubjectId: string;
  marks: MarkInput[];
  enteredByUserId: string;
  /** `true` moves the marks from DRAFT to SUBMITTED for approval. */
  submit?: boolean;
}

/**
 * Save marks for one exam subject.
 *
 * A mark above the maximum, or a combination of theory and practical that
 * exceeds it, is rejected rather than clamped — silently reducing a score
 * would corrupt the student's record.
 */
export async function saveMarks(input: SaveMarksInput) {
  const examSubject = await prisma.examSubject.findUnique({
    where: { id: input.examSubjectId },
    include: {
      exam: { select: { id: true, name: true, resultStatus: true } },
      gradeScale: { include: { bands: true } },
    },
  });

  if (!examSubject) throw notFound('Exam subject not found.');

  if (examSubject.exam.resultStatus === ResultStatus.PUBLISHED) {
    throw conflict(
      'Results for this examination have already been published. Request a correction instead of editing marks.',
    );
  }

  const maxMarks = Number(examSubject.maxMarks.toString());
  const theoryMax = examSubject.theoryMax ? Number(examSubject.theoryMax.toString()) : null;
  const practicalMax = examSubject.practicalMax
    ? Number(examSubject.practicalMax.toString())
    : null;

  const bands = examSubject.gradeScale
    ? examSubject.gradeScale.bands.map((b) => ({
        grade: b.grade,
        minPercent: Number(b.minPercent.toString()),
        maxPercent: Number(b.maxPercent.toString()),
        gpa: b.gpa === null ? null : Number(b.gpa.toString()),
        remark: b.remark,
      }))
    : ((await loadGradeScale(null))?.bands ?? []);

  // Only students enrolled in this class section may receive marks.
  const enrolled = await prisma.enrollment.findMany({
    where: {
      classSectionId: examSubject.classSectionId,
      studentId: { in: input.marks.map((m) => m.studentId) },
      status: 'ACTIVE',
    },
    select: { studentId: true },
  });
  const enrolledIds = new Set(enrolled.map((e) => e.studentId));

  for (const mark of input.marks) {
    if (!enrolledIds.has(mark.studentId)) {
      throw validationError(
        'One or more students are not enrolled in the class for this examination.',
        { studentId: mark.studentId },
      );
    }

    if (mark.status === MarksEntryStatus.SCORED) {
      if (mark.marksObtained === null || mark.marksObtained === undefined) {
        throw validationError('A scored result must include the marks obtained.');
      }
      if (mark.marksObtained < 0) {
        throw validationError('Marks cannot be negative.');
      }
      if (mark.marksObtained > maxMarks) {
        throw validationError(
          `Marks cannot exceed the maximum of ${maxMarks} for this subject.`,
          { studentId: mark.studentId, maxMarks },
        );
      }

      if (theoryMax !== null && mark.theoryMarks != null && mark.theoryMarks > theoryMax) {
        throw validationError(`Theory marks cannot exceed ${theoryMax}.`);
      }
      if (practicalMax !== null && mark.practicalMarks != null && mark.practicalMarks > practicalMax) {
        throw validationError(`Practical marks cannot exceed ${practicalMax}.`);
      }
    }
  }

  return prisma.$transaction(async (tx) => {
    const saved: string[] = [];

    for (const mark of input.marks) {
      const derived = computeMarkDerived({
        marksObtained: mark.marksObtained ?? null,
        maxMarks,
        status: mark.status,
        bands,
      });

      const existing = await tx.examResult.findUnique({
        where: {
          examSubjectId_studentId: {
            examSubjectId: input.examSubjectId,
            studentId: mark.studentId,
          },
        },
        select: { id: true, marksObtained: true, grade: true, status: true },
      });

      const record = await tx.examResult.upsert({
        where: {
          examSubjectId_studentId: {
            examSubjectId: input.examSubjectId,
            studentId: mark.studentId,
          },
        },
        create: {
          examSubjectId: input.examSubjectId,
          studentId: mark.studentId,
          marksObtained: mark.marksObtained ?? null,
          theoryMarks: mark.theoryMarks ?? null,
          practicalMarks: mark.practicalMarks ?? null,
          status: mark.status,
          percentage: derived.percentage,
          grade: derived.grade,
          gpa: derived.gpa,
          remarks: mark.remarks ?? null,
          enteredBy: input.enteredByUserId,
          gradeScaleId: examSubject.gradeScaleId,
        },
        update: {
          marksObtained: mark.marksObtained ?? null,
          theoryMarks: mark.theoryMarks ?? null,
          practicalMarks: mark.practicalMarks ?? null,
          status: mark.status,
          percentage: derived.percentage,
          grade: derived.grade,
          gpa: derived.gpa,
          remarks: mark.remarks ?? null,
          enteredBy: input.enteredByUserId,
          enteredAt: new Date(),
          gradeScaleId: examSubject.gradeScaleId,
        },
        select: { id: true },
      });

      // Keep an immutable trail of every mark change for later disputes.
      if (existing) {
        const changed =
          Number(existing.marksObtained?.toString() ?? 'NaN') !==
            Number(mark.marksObtained ?? 'NaN') || existing.grade !== derived.grade;

        if (changed) {
          await tx.examResultAudit.create({
            data: {
              examResultId: record.id,
              previousMarks: existing.marksObtained,
              newMarks: mark.marksObtained ?? null,
              previousGrade: existing.grade,
              newGrade: derived.grade,
              reason: input.submit ? 'Marks submitted for approval' : 'Marks updated',
              changedBy: input.enteredByUserId,
            },
          });
        }
      }

      saved.push(record.id);
    }

    return { saved: saved.length, resultIds: saved };
  });
}

/** Move every mark for an exam from DRAFT to SUBMITTED so it can be approved. */
export async function submitExamForApproval(examId: string) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, resultStatus: true },
  });

  if (!exam) throw notFound('Examination not found.');
  if (exam.resultStatus === ResultStatus.PUBLISHED) {
    throw conflict('These results are already published.');
  }

  const subjects = await prisma.examSubject.findMany({
    where: { examId },
    select: { id: true },
  });

  await prisma.exam.update({
    where: { id: examId },
    data: { resultStatus: ResultStatus.SUBMITTED },
  });

  return { subjects: subjects.length };
}

/**
 * Approve an exam's results, computing ranks where the academy enables them.
 *
 * Ranking runs over the aggregated total per student within each class section
 * so a shared exam spanning several classes does not mix cohorts.
 */
export async function approveExamResults(options: {
  examId: string;
  actorUserId: string;
  computeRanks?: boolean;
}) {
  const exam = await prisma.exam.findUnique({
    where: { id: options.examId },
    include: { subjects: { include: { results: true } } },
  });

  if (!exam) throw notFound('Examination not found.');

  if (exam.resultStatus === ResultStatus.PUBLISHED) {
    throw conflict('These results are already published.');
  }

  await prisma.$transaction(async (tx) => {
    if (options.computeRanks !== false) {
      // Aggregate per student per class section.
      const totals = new Map<string, { total: number; max: number; classSectionId: string }>();

      for (const subject of exam.subjects) {
        const maxMarks = Number(subject.maxMarks.toString());

        for (const result of subject.results) {
          if (result.status !== MarksEntryStatus.SCORED) continue;

          const key = `${result.studentId}:${subject.classSectionId}`;
          const bucket = totals.get(key) ?? {
            total: 0,
            max: 0,
            classSectionId: subject.classSectionId,
          };
          bucket.total += Number(result.marksObtained?.toString() ?? '0');
          bucket.max += maxMarks;
          totals.set(key, bucket);
        }
      }

      // Rank within each class section, highest total first.
      const byClass = new Map<string, { key: string; total: number }[]>();
      for (const [key, value] of totals) {
        const list = byClass.get(value.classSectionId) ?? [];
        list.push({ key, total: value.total });
        byClass.set(value.classSectionId, list);
      }

      for (const list of byClass.values()) {
        list.sort((a, b) => b.total - a.total);
        let rank = 0;
        let previousTotal: number | null = null;

        for (let i = 0; i < list.length; i += 1) {
          // Equal totals share a rank; the next rank skips ahead.
          if (previousTotal === null || list[i].total !== previousTotal) {
            rank = i + 1;
            previousTotal = list[i].total;
          }

          const studentId = list[i].key.split(':')[0];

          await tx.examResult.updateMany({
            where: {
              studentId,
              examSubject: { examId: options.examId },
            },
            data: { rank },
          });
        }
      }
    }

    await tx.examSubject.updateMany({
      where: { examId: options.examId },
      data: {},
    });

    await tx.examResult.updateMany({
      where: { examSubject: { examId: options.examId } },
      data: { approvedBy: options.actorUserId, approvedAt: new Date() },
    });

    await tx.exam.update({
      where: { id: options.examId },
      data: { resultStatus: ResultStatus.APPROVED },
    });
  });

  return { examId: options.examId, status: ResultStatus.APPROVED };
}

/** Publish approved results and return the students who must be notified. */
export async function publishExamResults(options: {
  examId: string;
  actorUserId: string;
}) {
  const exam = await prisma.exam.findUnique({
    where: { id: options.examId },
    include: {
      subjects: { select: { id: true, classSectionId: true } },
    },
  });

  if (!exam) throw notFound('Examination not found.');

  if (exam.resultStatus === ResultStatus.PUBLISHED) {
    throw conflict('These results are already published.');
  }

  if (exam.resultStatus !== ResultStatus.APPROVED) {
    throw conflict(
      'Results must be approved before they can be published. Approve them first.',
    );
  }

  const classSectionIds = Array.from(new Set(exam.subjects.map((s) => s.classSectionId)));

  const enrollments = await prisma.enrollment.findMany({
    where: { classSectionId: { in: classSectionIds }, status: 'ACTIVE' },
    select: { studentId: true },
  });

  await prisma.exam.update({
    where: { id: options.examId },
    data: { resultStatus: ResultStatus.PUBLISHED, publishedAt: new Date() },
  });

  return {
    examId: options.examId,
    examName: exam.name,
    studentIds: Array.from(new Set(enrollments.map((e) => e.studentId))),
  };
}

/* --------------------------------------------------------------------------
   Result computation
   -------------------------------------------------------------------------- */

export interface SubjectResult {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  maxMarks: number;
  passMarks: number;
  marksObtained: number | null;
  percentage: number | null;
  grade: string | null;
  gpa: number | null;
  status: MarksEntryStatus;
  isPass: boolean | null;
  remarks: string | null;
}

export interface StudentResultCard {
  student: {
    id: string;
    admissionNo: string;
    name: string;
    rollNo: string | null;
  };
  exam: {
    id: string;
    name: string;
    examType: string;
    startDate: Date;
    endDate: Date;
    resultStatus: ResultStatus;
    publishedAt: Date | null;
  };
  className: string | null;
  subjects: SubjectResult[];
  totals: {
    obtained: number;
    maximum: number;
    percentage: number | null;
    gpa: number | null;
    grade: string | null;
    rank: number | null;
    passedSubjects: number;
    failedSubjects: number;
    absentSubjects: number;
  };
  overallPass: boolean;
}

/** Build a full result card for one student in one examination. */
export async function buildResultCard(options: {
  examId: string;
  studentId: string;
}): Promise<StudentResultCard> {
  const [exam, student] = await Promise.all([
    prisma.exam.findUnique({
      where: { id: options.examId },
      include: {
        subjects: {
          include: {
            subject: { select: { id: true, name: true, code: true } },
            classSection: { select: { id: true, name: true } },
            results: {
              where: { studentId: options.studentId },
            },
          },
        },
      },
    }),
    prisma.student.findUnique({
      where: { id: options.studentId },
      select: {
        id: true,
        admissionNo: true,
        firstName: true,
        lastName: true,
        rollNo: true,
      },
    }),
  ]);

  if (!exam) throw notFound('Examination not found.');
  if (!student) throw notFound('Student not found.');

  // A shared examination can span several class sections. A student only sits
  // the subjects of the section they are enrolled in, so scope the card to the
  // intersection of the exam's sections and the student's enrolments. Without
  // this, every other section's subjects are counted as absences and the totals
  // are wrong.
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: options.studentId },
    select: { classSectionId: true },
  });
  const enrolledSections = new Set(enrollments.map((e) => e.classSectionId));
  const applicableSubjects = exam.subjects.filter((s) => enrolledSections.has(s.classSectionId));

  const defaultBands = (await loadGradeScale(null))?.bands ?? [];

  const subjects: SubjectResult[] = [];
  let obtained = 0;
  let maximum = 0;
  let gpaSum = 0;
  let gpaCount = 0;
  let failed = 0;
  let passed = 0;
  let absent = 0;
  let rank: number | null = null;

  for (const examSubject of applicableSubjects) {
    const result = examSubject.results[0];
    const maxMarks = Number(examSubject.maxMarks.toString());
    const passMarks = Number(examSubject.passMarks.toString());

    const status = result?.status ?? MarksEntryStatus.ABSENT;
    const marksObtained =
      result?.marksObtained === null || result?.marksObtained === undefined
        ? null
        : Number(result.marksObtained.toString());

    let isPass: boolean | null = null;

    if (status === MarksEntryStatus.SCORED && marksObtained !== null) {
      isPass = marksObtained >= passMarks;
      obtained += marksObtained;
      maximum += maxMarks;
      if (isPass) passed += 1;
      else failed += 1;
    } else {
      maximum += maxMarks;
      if (status === MarksEntryStatus.ABSENT) absent += 1;
    }

    if (result?.gpa !== null && result?.gpa !== undefined) {
      gpaSum += Number(result.gpa.toString());
      gpaCount += 1;
    }

    if (result?.rank != null) rank = result.rank;

    const percentage =
      result?.percentage === null || result?.percentage === undefined
        ? null
        : Number(result.percentage.toString());

    subjects.push({
      subjectId: examSubject.subject.id,
      subjectName: examSubject.subject.name,
      subjectCode: examSubject.subject.code,
      maxMarks,
      passMarks,
      marksObtained,
      percentage,
      grade: result?.grade ?? null,
      gpa: result?.gpa === null || result?.gpa === undefined ? null : Number(result.gpa.toString()),
      status,
      isPass,
      remarks: result?.remarks ?? null,
    });
  }

  const percentage = maximum > 0 ? round2((obtained / maximum) * 100) : null;
  const overallBand = percentage === null ? null : resolveGrade(percentage, defaultBands);

  return {
    student: {
      id: student.id,
      admissionNo: student.admissionNo,
      name: `${student.firstName} ${student.lastName}`.trim(),
      rollNo: student.rollNo,
    },
    exam: {
      id: exam.id,
      name: exam.name,
      examType: exam.examType,
      startDate: exam.startDate,
      endDate: exam.endDate,
      resultStatus: exam.resultStatus,
      publishedAt: exam.publishedAt,
    },
    className: applicableSubjects[0]?.classSection.name ?? null,
    subjects: subjects.sort((a, b) => a.subjectName.localeCompare(b.subjectName)),
    totals: {
      obtained: round2(obtained),
      maximum: round2(maximum),
      percentage,
      gpa: gpaCount > 0 ? round2(gpaSum / gpaCount) : null,
      grade: overallBand?.grade ?? null,
      rank,
      passedSubjects: passed,
      failedSubjects: failed,
      absentSubjects: absent,
    },
    overallPass: failed === 0 && absent === 0 && maximum > 0,
  };
}

/** Per-student performance trend across published examinations. */
export async function studentPerformanceTrend(studentId: string, limit = 10) {
  const results = await prisma.examResult.findMany({
    where: {
      studentId,
      status: MarksEntryStatus.SCORED,
      examSubject: { exam: { resultStatus: ResultStatus.PUBLISHED } },
    },
    include: {
      examSubject: {
        include: {
          exam: { select: { id: true, name: true, examType: true, endDate: true } },
          subject: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { examSubject: { exam: { endDate: 'asc' } } },
  });

  // Collapse subject-level rows into one percentage per examination.
  const byExam = new Map<
    string,
    { name: string; examType: string; date: Date; obtained: number; maximum: number; subjectCount: number }
  >();

  for (const result of results) {
    const exam = result.examSubject.exam;
    const bucket = byExam.get(exam.id) ?? {
      name: exam.name,
      examType: exam.examType,
      date: exam.endDate,
      obtained: 0,
      maximum: 0,
      subjectCount: 0,
    };

    bucket.obtained += Number(result.marksObtained?.toString() ?? '0');
    bucket.maximum += Number(result.examSubject.maxMarks.toString());
    bucket.subjectCount += 1;
    byExam.set(exam.id, bucket);
  }

  return Array.from(byExam.entries())
    .map(([examId, bucket]) => ({
      examId,
      examName: bucket.name,
      examType: bucket.examType,
      date: bucket.date,
      percentage: bucket.maximum > 0 ? round2((bucket.obtained / bucket.maximum) * 100) : null,
      subjectCount: bucket.subjectCount,
    }))
    .filter((row) => row.percentage !== null)
    .slice(-limit);
}

/** Subject-wise averages for a class, used in class comparison reports. */
export async function classSubjectPerformance(options: {
  classSectionId: string;
  examId?: string;
}) {
  const subjects = await prisma.examSubject.findMany({
    where: {
      classSectionId: options.classSectionId,
      ...(options.examId ? { examId: options.examId } : {}),
    },
    include: {
      subject: { select: { id: true, name: true } },
      results: {
        where: { status: MarksEntryStatus.SCORED },
        select: { percentage: true, marksObtained: true },
      },
    },
  });

  return subjects.map((examSubject) => {
    const percentages = examSubject.results
      .map((r) => (r.percentage === null ? null : Number(r.percentage.toString())))
      .filter((v): v is number => v !== null);

    const average =
      percentages.length > 0
        ? round2(percentages.reduce((a, b) => a + b, 0) / percentages.length)
        : null;

    const highest = percentages.length > 0 ? Math.max(...percentages) : null;
    const lowest = percentages.length > 0 ? Math.min(...percentages) : null;

    const passMarks = Number(examSubject.passMarks.toString());
    const maxMarks = Number(examSubject.maxMarks.toString());
    const passedCount = examSubject.results.filter(
      (r) => Number(r.marksObtained?.toString() ?? '0') >= passMarks,
    ).length;

    return {
      subjectId: examSubject.subject.id,
      subjectName: examSubject.subject.name,
      examId: examSubject.examId,
      maxMarks,
      passMarks,
      studentCount: examSubject.results.length,
      average,
      highest,
      lowest,
      passRate:
        examSubject.results.length > 0
          ? round2((passedCount / examSubject.results.length) * 100)
          : null,
    };
  });
}

/** Students who failed at least one subject in an examination. */
export async function failedSubjectStudents(examId: string) {
  const subjects = await prisma.examSubject.findMany({
    where: { examId },
    include: {
      subject: { select: { name: true } },
      results: { include: { student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } } } },
    },
  });

  const byStudent = new Map<
    string,
    {
      student: { id: string; firstName: string; lastName: string; admissionNo: string };
      failedSubjects: string[];
    }
  >();

  for (const examSubject of subjects) {
    const passMarks = Number(examSubject.passMarks.toString());

    for (const result of examSubject.results) {
      if (result.status !== MarksEntryStatus.SCORED) continue;

      const marks = Number(result.marksObtained?.toString() ?? '0');
      if (marks >= passMarks) continue;

      const bucket = byStudent.get(result.student.id) ?? {
        student: result.student,
        failedSubjects: [],
      };
      bucket.failedSubjects.push(examSubject.subject.name);
      byStudent.set(result.student.id, bucket);
    }
  }

  return Array.from(byStudent.values());
}

export const RESULT_STATUS_LABELS: Record<ResultStatus, string> = {
  [ResultStatus.DRAFT]: 'Draft',
  [ResultStatus.SUBMITTED]: 'Submitted for approval',
  [ResultStatus.APPROVED]: 'Approved',
  [ResultStatus.PUBLISHED]: 'Published',
  [ResultStatus.WITHHELD]: 'Withheld',
};

export const RESULT_STATUS_TONES: Record<
  ResultStatus,
  'neutral' | 'info' | 'warning' | 'success' | 'danger'
> = {
  [ResultStatus.DRAFT]: 'neutral',
  [ResultStatus.SUBMITTED]: 'warning',
  [ResultStatus.APPROVED]: 'info',
  [ResultStatus.PUBLISHED]: 'success',
  [ResultStatus.WITHHELD]: 'danger',
};

export const MARKS_STATUS_LABELS: Record<MarksEntryStatus, string> = {
  [MarksEntryStatus.SCORED]: 'Scored',
  [MarksEntryStatus.ABSENT]: 'Absent',
  [MarksEntryStatus.EXEMPT]: 'Exempt',
  [MarksEntryStatus.WITHHELD]: 'Withheld',
};

export const EXAM_TYPE_LABELS: Record<string, string> = {
  QUIZ: 'Quiz',
  MONTHLY_TEST: 'Monthly test',
  MIDTERM: 'Midterm',
  FINAL: 'Final',
  PRACTICAL: 'Practical',
  MOCK_TEST: 'Mock test',
  ASSIGNMENT: 'Assignment',
};
