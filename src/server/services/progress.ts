import { prisma } from '@/lib/prisma';
import { EnrollmentStatus, MarksEntryStatus, ResultStatus, SubmissionStatus } from '@prisma/client';
import { attendanceSummary } from './attendance';
import { studentPerformanceTrend } from './exams';
import { round2, studentFeeSummary } from './fees';
import { getAttendanceRules } from '@/server/settings';

/**
 * Student progress profile.
 *
 * Every figure here is derived from stored records. Where a value cannot be
 * computed from real data the field is `null` and the UI shows "not enough
 * data" rather than a misleading zero.
 */

export interface SubjectProgress {
  subjectId: string;
  subjectName: string;
  assessments: number;
  averagePercentage: number | null;
  latestPercentage: number | null;
  /** Latest assessment minus the average: positive means improving. */
  trendDelta: number | null;
  assignmentCompletionRate: number | null;
  assignmentsDue: number;
  assignmentsSubmitted: number;
  assignmentsOverdue: number;
}

export interface ProgressAlert {
  code: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  detail: string;
}

export interface StudentProgressProfile {
  student: {
    id: string;
    admissionNo: string;
    name: string;
    status: EnrollmentStatus;
    className: string | null;
    courseName: string | null;
    sessionName: string | null;
  };
  attendance: {
    percentage: number | null;
    totalSessions: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    leaveApproved: number;
    consecutiveAbsences: number;
    belowThreshold: boolean;
    threshold: number;
  };
  academics: {
    examCount: number;
    averagePercentage: number | null;
    latestPercentage: number | null;
    trend: { examId: string; examName: string; percentage: number | null; date: Date }[];
    strongestSubjects: { subjectName: string; percentage: number }[];
    weakestSubjects: { subjectName: string; percentage: number }[];
  };
  subjects: SubjectProgress[];
  assignments: {
    total: number;
    submitted: number;
    graded: number;
    late: number;
    missing: number;
    completionRate: number | null;
    averageScore: number | null;
  };
  fees: {
    totalInvoiced: number;
    totalPaid: number;
    outstanding: number;
    overdue: number;
    openInvoices: number;
  } | null;
  alerts: ProgressAlert[];
  achievements: { code: string; label: string; detail: string }[];
}

export async function buildStudentProgress(
  studentId: string,
  options: { includeFees?: boolean; from?: Date; to?: Date } = {},
): Promise<StudentProgressProfile> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      enrollments: {
        where: { status: EnrollmentStatus.ACTIVE },
        include: {
          classSection: {
            include: { course: true, academicSession: true },
          },
        },
        take: 1,
      },
    },
  });

  if (!student) throw new Error('Student not found.');

  const enrollment = student.enrollments[0];
  const classSectionId = enrollment?.classSectionId;

  const rules = await getAttendanceRules();

  const [attendance, trend, submissionStats, subjectData] = await Promise.all([
    attendanceSummary({ studentId, from: options.from, to: options.to }),
    studentPerformanceTrend(studentId, 12),
    assignmentStats(studentId, classSectionId),
    subjectPerformance(studentId),
  ]);

  // Consecutive absences from the most recent records.
  const recent = await prisma.attendanceRecord.findMany({
    where: { studentId, status: { in: ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'LEAVE_APPROVED'] } },
    orderBy: { attendanceSession: { date: 'desc' } },
    take: 30,
    select: { status: true },
  });

  let consecutiveAbsences = 0;
  for (const record of recent) {
    if (record.status === 'ABSENT') consecutiveAbsences += 1;
    else break;
  }

  const feeSummary = options.includeFees ? await studentFeeSummary(studentId) : null;

  const percentages = subjectData
    .map((s) => ({ subjectName: s.subjectName, percentage: s.averagePercentage }))
    .filter((s): s is { subjectName: string; percentage: number } => s.percentage !== null)
    .sort((a, b) => b.percentage - a.percentage);

  const averagePercentage =
    percentages.length > 0
      ? round2(percentages.reduce((sum, s) => sum + s.percentage, 0) / percentages.length)
      : null;

  const latest = trend.length > 0 ? trend[trend.length - 1] : null;

  const alerts = buildAlerts({
    attendancePercentage: attendance.percentage,
    threshold: rules.minimumPercentage,
    consecutiveAbsences,
    thresholdConsecutive: rules.consecutiveAbsenceThreshold,
    trend,
    subjects: subjectData,
    missingAssignments: submissionStats.missing,
    outstandingFees: feeSummary?.totalOutstanding ?? null,
    overdueFees: feeSummary?.overdueAmount ?? null,
  });

  return {
    student: {
      id: student.id,
      admissionNo: student.admissionNo,
      name: `${student.firstName} ${student.lastName}`.trim(),
      status: student.status,
      className: enrollment?.classSection.name ?? null,
      courseName: enrollment?.classSection.course.name ?? null,
      sessionName: enrollment?.classSection.academicSession.name ?? null,
    },
    attendance: {
      percentage: attendance.percentage,
      totalSessions: attendance.total,
      present: attendance.present,
      absent: attendance.absent,
      late: attendance.late,
      excused: attendance.excused,
      leaveApproved: attendance.leaveApproved,
      consecutiveAbsences,
      belowThreshold:
        attendance.percentage !== null && attendance.percentage < rules.minimumPercentage,
      threshold: rules.minimumPercentage,
    },
    academics: {
      examCount: trend.length,
      averagePercentage,
      latestPercentage: latest?.percentage ?? null,
      trend: trend.map((t) => ({
        examId: t.examId,
        examName: t.examName,
        percentage: t.percentage,
        date: t.date,
      })),
      strongestSubjects: percentages.slice(0, 3),
      weakestSubjects: [...percentages].reverse().slice(0, 3),
    },
    subjects: subjectData,
    assignments: submissionStats,
    fees: feeSummary
      ? {
          totalInvoiced: feeSummary.totalInvoiced,
          totalPaid: feeSummary.totalPaid,
          outstanding: feeSummary.totalOutstanding,
          overdue: feeSummary.overdueAmount,
          openInvoices: feeSummary.openInvoiceCount,
        }
      : null,
    alerts,
    achievements: buildAchievements({
      attendancePercentage: attendance.percentage,
      averagePercentage,
      completionRate: submissionStats.completionRate,
      trend,
    }),
  };
}

/** Per-subject averages and assignment completion. */
async function subjectPerformance(studentId: string): Promise<SubjectProgress[]> {
  const [results, assignments] = await Promise.all([
    prisma.examResult.findMany({
      where: {
        studentId,
        status: MarksEntryStatus.SCORED,
        examSubject: { exam: { resultStatus: ResultStatus.PUBLISHED } },
      },
      include: {
        examSubject: {
          include: {
            subject: { select: { id: true, name: true } },
            exam: { select: { endDate: true } },
          },
        },
      },
      orderBy: { examSubject: { exam: { endDate: 'asc' } } },
    }),
    prisma.assignment.findMany({
      where: {
        status: 'PUBLISHED',
        submissions: { some: { studentId } },
      },
      include: {
        subject: { select: { id: true, name: true } },
        submissions: { where: { studentId }, select: { status: true, submittedAt: true } },
      },
    }),
  ]);

  const bySubject = new Map<
    string,
    {
      subjectName: string;
      percentages: number[];
      assignmentsDue: number;
      assignmentsSubmitted: number;
      assignmentsOverdue: number;
    }
  >();

  for (const result of results) {
    const subject = result.examSubject.subject;
    const bucket = bySubject.get(subject.id) ?? {
      subjectName: subject.name,
      percentages: [],
      assignmentsDue: 0,
      assignmentsSubmitted: 0,
      assignmentsOverdue: 0,
    };

    const percentage =
      result.percentage === null
        ? null
        : Number(result.percentage.toString());

    if (percentage !== null) bucket.percentages.push(percentage);
    bySubject.set(subject.id, bucket);
  }

  for (const assignment of assignments) {
    const subject = assignment.subject;
    const bucket = bySubject.get(subject.id) ?? {
      subjectName: subject.name,
      percentages: [],
      assignmentsDue: 0,
      assignmentsSubmitted: 0,
      assignmentsOverdue: 0,
    };

    const submission = assignment.submissions[0];
    bucket.assignmentsDue += 1;

    if (submission && submission.status !== SubmissionStatus.NOT_SUBMITTED) {
      bucket.assignmentsSubmitted += 1;
    } else if (assignment.dueAt.getTime() < Date.now()) {
      bucket.assignmentsOverdue += 1;
    }

    bySubject.set(subject.id, bucket);
  }

  return Array.from(bySubject.entries())
    .map(([subjectId, bucket]) => {
      const count = bucket.percentages.length;
      const average =
        count > 0
          ? round2(bucket.percentages.reduce((a, b) => a + b, 0) / count)
          : null;
      const latestPercentage = count > 0 ? bucket.percentages[count - 1] : null;

      return {
        subjectId,
        subjectName: bucket.subjectName,
        assessments: count,
        averagePercentage: average,
        latestPercentage,
        trendDelta:
          average !== null && latestPercentage !== null
            ? round2(latestPercentage - average)
            : null,
        assignmentCompletionRate:
          bucket.assignmentsDue > 0
            ? round2((bucket.assignmentsSubmitted / bucket.assignmentsDue) * 100)
            : null,
        assignmentsDue: bucket.assignmentsDue,
        assignmentsSubmitted: bucket.assignmentsSubmitted,
        assignmentsOverdue: bucket.assignmentsOverdue,
      };
    })
    .sort((a, b) => (b.averagePercentage ?? -1) - (a.averagePercentage ?? -1));
}

/** Assignment completion statistics for one student. */
async function assignmentStats(studentId: string, classSectionId?: string) {
  const assignments = await prisma.assignment.findMany({
    where: {
      status: 'PUBLISHED',
      ...(classSectionId ? { classSectionId } : {}),
      OR: [{ submissions: { some: { studentId } } }, { classSectionId }],
    },
    include: {
      submissions: { where: { studentId } },
    },
  });

  let submitted = 0;
  let graded = 0;
  let late = 0;
  let missing = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  let completed = 0;

  for (const assignment of assignments) {
    const submission = assignment.submissions[0];

    if (!submission || submission.status === SubmissionStatus.NOT_SUBMITTED) {
      if (assignment.dueAt.getTime() < Date.now()) missing += 1;
      continue;
    }

    // Each submitted assignment counts once towards completion; "late" and
    // "graded" are overlapping flags on top of that, not separate buckets.
    completed += 1;

    if (submission.status === SubmissionStatus.LATE || submission.isLate) late += 1;
    else submitted += 1;

    if (submission.status === SubmissionStatus.GRADED && submission.marksObtained !== null) {
      graded += 1;
      const max = Number(assignment.maxMarks.toString());
      if (max > 0) {
        scoreSum += (Number(submission.marksObtained.toString()) / max) * 100;
        scoreCount += 1;
      }
    }
  }

  const total = assignments.length;

  return {
    total,
    submitted,
    graded,
    late,
    missing,
    completionRate: total > 0 ? round2((completed / total) * 100) : null,
    averageScore: scoreCount > 0 ? round2(scoreSum / scoreCount) : null,
  };
}

/**
 * Transparent, rule-based alerts.
 *
 * These are surfaced to staff and guardians as information. They never trigger
 * an automatic academic penalty — that decision stays with the academy.
 */
function buildAlerts(input: {
  attendancePercentage: number | null;
  threshold: number;
  consecutiveAbsences: number;
  thresholdConsecutive: number;
  trend: { examName: string; percentage: number | null }[];
  subjects: SubjectProgress[];
  missingAssignments: number;
  outstandingFees: number | null;
  overdueFees: number | null;
}): ProgressAlert[] {
  const alerts: ProgressAlert[] = [];

  if (input.attendancePercentage !== null && input.attendancePercentage < input.threshold) {
    alerts.push({
      code: 'LOW_ATTENDANCE',
      severity: input.attendancePercentage < input.threshold - 15 ? 'CRITICAL' : 'WARNING',
      title: 'Attendance below the academy threshold',
      detail: `Attendance is ${input.attendancePercentage.toFixed(1)}%, below the required ${input.threshold}%.`,
    });
  }

  if (input.consecutiveAbsences >= input.thresholdConsecutive) {
    alerts.push({
      code: 'CONSECUTIVE_ABSENCE',
      severity: 'WARNING',
      title: 'Repeated consecutive absences',
      detail: `${input.consecutiveAbsences} consecutive absences have been recorded.`,
    });
  }

  // A decline needs at least three data points to be meaningful.
  const scored = input.trend.filter((t) => t.percentage !== null);
  if (scored.length >= 3) {
    const recent = scored.slice(-3).map((t) => t.percentage as number);
    const declining = recent[0] > recent[1] && recent[1] > recent[2];

    if (declining) {
      alerts.push({
        code: 'DECLINING_MARKS',
        severity: 'WARNING',
        title: 'Marks declining across recent assessments',
        detail: `Results have fallen across the last three examinations: ${recent.map((p) => `${p.toFixed(1)}%`).join(' → ')}.`,
      });
    }
  }

  if (input.missingAssignments >= 3) {
    alerts.push({
      code: 'MISSING_ASSIGNMENTS',
      severity: input.missingAssignments >= 5 ? 'CRITICAL' : 'WARNING',
      title: 'Multiple overdue assignments',
      detail: `${input.missingAssignments} assignments are overdue and not submitted.`,
    });
  }

  const weakSubjects = input.subjects.filter(
    (s) => s.averagePercentage !== null && s.averagePercentage < 50,
  );

  if (weakSubjects.length > 0) {
    alerts.push({
      code: 'WEAK_SUBJECTS',
      severity: 'INFO',
      title: 'Subjects needing additional attention',
      detail: `Average below 50% in ${weakSubjects.map((s) => s.subjectName).join(', ')}.`,
    });
  }

  if (input.overdueFees !== null && input.overdueFees > 0) {
    alerts.push({
      code: 'OVERDUE_FEES',
      severity: 'WARNING',
      title: 'Overdue fee balance',
      detail: `An overdue balance is outstanding on this account.`,
    });
  }

  return alerts;
}

/**
 * Achievements are derived from measured performance only. They are private to
 * the student and their guardians — never shown to classmates.
 */
function buildAchievements(input: {
  attendancePercentage: number | null;
  averagePercentage: number | null;
  completionRate: number | null;
  trend: { percentage: number | null }[];
}): { code: string; label: string; detail: string }[] {
  const achievements: { code: string; label: string; detail: string }[] = [];

  if (input.attendancePercentage !== null && input.attendancePercentage >= 95) {
    achievements.push({
      code: 'PERFECT_ATTENDANCE',
      label: 'Excellent attendance',
      detail: `Attended ${input.attendancePercentage.toFixed(1)}% of sessions.`,
    });
  }

  if (input.averagePercentage !== null && input.averagePercentage >= 85) {
    achievements.push({
      code: 'HIGH_ACHIEVER',
      label: 'High academic achievement',
      detail: `Maintaining an average of ${input.averagePercentage.toFixed(1)}%.`,
    });
  }

  if (input.completionRate !== null && input.completionRate >= 95) {
    achievements.push({
      code: 'ASSIGNMENT_STREAK',
      label: 'Consistent assignment completion',
      detail: `Completed ${input.completionRate.toFixed(0)}% of assignments on time.`,
    });
  }

  const scored = input.trend
    .map((t) => t.percentage)
    .filter((p): p is number => p !== null);

  if (scored.length >= 3) {
    const recent = scored.slice(-3);
    if (recent[2] > recent[1] && recent[1] > recent[0]) {
      achievements.push({
        code: 'IMPROVING',
        label: 'Improving results',
        detail: 'Results have improved across the last three examinations.',
      });
    }
  }

  return achievements;
}

/**
 * Evaluate every active student against the configured warning rules and
 * persist newly detected alerts. Existing alerts for the same rule and student
 * are not duplicated.
 */
export async function refreshStudentAlerts(options: {
  classSectionId?: string;
  studentIds?: string[];
  includeFees?: boolean;
} = {}) {
  const rules = await getAttendanceRules();

  const enrollments = await prisma.enrollment.findMany({
    where: {
      status: EnrollmentStatus.ACTIVE,
      ...(options.classSectionId ? { classSectionId: options.classSectionId } : {}),
      ...(options.studentIds ? { studentId: { in: options.studentIds } } : {}),
    },
    select: { studentId: true },
    distinct: ['studentId'],
  });

  let created = 0;
  let evaluated = 0;

  for (const { studentId } of enrollments) {
    evaluated += 1;

    try {
      const profile = await buildStudentProgress(studentId, {
        includeFees: options.includeFees ?? false,
      });

      for (const alert of profile.alerts) {
        // Skip if an unresolved alert of the same rule already exists.
        const existing = await prisma.studentAlert.findFirst({
          where: { studentId, ruleCode: alert.code, isResolved: false },
          select: { id: true },
        });

        if (existing) continue;

        await prisma.studentAlert.create({
          data: {
            studentId,
            ruleCode: alert.code,
            severity: alert.severity,
            title: alert.title,
            detail: alert.detail,
            context: {
              attendancePercentage: profile.attendance.percentage,
              threshold: rules.minimumPercentage,
              consecutiveAbsences: profile.attendance.consecutiveAbsences,
            },
          },
        });
        created += 1;
      }
    } catch (error) {
      console.error(`[progress] failed to evaluate student ${studentId}:`, error);
    }
  }

  return { evaluated, created };
}

/** Academy-wide progress aggregates for the owner dashboard. */
export async function academyProgressOverview(options: { classSectionId?: string } = {}) {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      status: EnrollmentStatus.ACTIVE,
      ...(options.classSectionId ? { classSectionId: options.classSectionId } : {}),
    },
    select: { studentId: true, classSectionId: true },
  });

  const studentIds = Array.from(new Set(enrollments.map((e) => e.studentId)));

  const [attendanceRecords, publishedResults, assignments, submissions] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: {
        studentId: { in: studentIds },
        status: { in: ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'LEAVE_APPROVED'] },
      },
      select: { studentId: true, status: true },
    }),
    prisma.examResult.findMany({
      where: {
        studentId: { in: studentIds },
        status: MarksEntryStatus.SCORED,
        examSubject: { exam: { resultStatus: ResultStatus.PUBLISHED } },
      },
      select: { percentage: true },
    }),
    prisma.assignment.count({ where: { status: 'PUBLISHED' } }),
    prisma.assignmentSubmission.count({
      where: { studentId: { in: studentIds }, status: { not: SubmissionStatus.NOT_SUBMITTED } },
    }),
  ]);

  const attendanceByStudent = new Map<string, { total: number; attended: number }>();
  for (const record of attendanceRecords) {
    const bucket = attendanceByStudent.get(record.studentId) ?? { total: 0, attended: 0 };
    bucket.total += 1;
    if (record.status !== 'ABSENT') bucket.attended += 1;
    attendanceByStudent.set(record.studentId, bucket);
  }

  const percentages = Array.from(attendanceByStudent.values())
    .filter((b) => b.total > 0)
    .map((b) => (b.attended / b.total) * 100);

  const averageAttendance =
    percentages.length > 0
      ? round2(percentages.reduce((a, b) => a + b, 0) / percentages.length)
      : null;

  const examPercentages = publishedResults
    .map((r) => (r.percentage === null ? null : Number(r.percentage.toString())))
    .filter((p): p is number => p !== null);

  const averageExamScore =
    examPercentages.length > 0
      ? round2(examPercentages.reduce((a, b) => a + b, 0) / examPercentages.length)
      : null;

  const thresholds = await getAttendanceRules();
  const belowThreshold = Array.from(attendanceByStudent.values()).filter(
    (b) => b.total > 0 && (b.attended / b.total) * 100 < thresholds.minimumPercentage,
  ).length;

  const expectedSubmissions = assignments * studentIds.length;

  return {
    studentCount: studentIds.length,
    averageAttendance,
    belowThresholdCount: belowThreshold,
    averageExamScore,
    publishedResultCount: publishedResults.length,
    assignmentCount: assignments,
    submissionRate:
      expectedSubmissions > 0
        ? round2((submissions / expectedSubmissions) * 100)
        : null,
  };
}
