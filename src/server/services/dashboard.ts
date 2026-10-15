import { prisma } from '@/lib/prisma';
import { academyConfig } from '@/lib/config';
import { getAttendanceRules, getFeeRules } from '@/server/settings';
import { whatsappStatus } from '@/server/whatsapp/adapter';
import { notificationQueueStats } from '@/server/notifications/queue';
import { academyProgressOverview } from './progress';

/**
 * Dashboard aggregates.
 *
 * Every figure is derived from stored records at request time. Nothing here is
 * sampled, cached or estimated, so a number on a dashboard can always be
 * traced back to the rows that produced it.
 */

export interface OwnerDashboard {
  students: {
    active: number;
    applicants: number;
    inactive: number;
    newThisMonth: number;
  };
  staff: {
    teachers: number;
    activeTeachers: number;
    supportStaff: number;
  };
  attendance: {
    markedToday: number;
    presentToday: number;
    absentToday: number;
    lateToday: number;
    percentageToday: number | null;
    averageAttendance: number | null;
    belowThreshold: number;
    threshold: number;
  };
  finance: {
    currency: string;
    collectedThisMonth: number;
    collectedToday: number;
    outstanding: number;
    overdue: number;
    overdueInvoiceCount: number;
    invoicedThisMonth: number;
  };
  academics: {
    activeClasses: number;
    activeCourses: number;
    activeSubjects: number;
    upcomingExams: number;
    publishedResults: number;
    averageExamScore: number | null;
  };
  assignments: {
    published: number;
    submissionRate: number | null;
    overdue: number;
  };
  alerts: {
    openAlerts: number;
    criticalAlerts: number;
    recentAlerts: Array<{
      id: string;
      studentId: string;
      studentName: string;
      title: string;
      severity: string;
      ruleCode: string;
      createdAt: Date;
    }>;
  };
  notifications: {
    mode: 'mock' | 'cloud';
    queued: number;
    failed: number;
    last24hTotal: number;
    last24hSimulated: number;
  };
  activity: Array<{
    id: string;
    level: string;
    source: string;
    message: string;
    createdAt: Date;
  }>;
  tasks: Array<{
    label: string;
    count: number;
    href: string;
    tone: 'brand' | 'warning' | 'info';
  }>;
}

function startOfToday(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function buildOwnerDashboard(now = new Date()): Promise<OwnerDashboard> {
  const today = startOfToday(now);
  const monthStart = startOfMonth(now);
  const attendanceRules = await getAttendanceRules();
  const feeRules = await getFeeRules();

  const [
    activeStudents,
    applicantCount,
    inactiveCount,
    newThisMonth,
    teacherCount,
    activeTeacherCount,
    supportStaffCount,
    todayRecords,
    invoicesThisMonth,
    paymentsThisMonth,
    paymentsToday,
    outstandingRows,
    overdueRows,
    activeClasses,
    activeCourses,
    activeSubjects,
    upcomingExams,
    publishedResultCount,
    assignmentPublished,
    assignmentOverdue,
    openAlerts,
    criticalAlerts,
    recentAlerts,
    queueStats,
    progress,
    recentEvents,
  ] = await Promise.all([
    prisma.student.count({ where: { status: 'ACTIVE' } }),
    prisma.student.count({ where: { status: 'APPLICANT' } }),
    prisma.student.count({ where: { status: { in: ['INACTIVE', 'WITHDRAWN'] } } }),
    prisma.student.count({ where: { admissionDate: { gte: monthStart } } }),
    prisma.teacherProfile.count(),
    prisma.teacherProfile.count({ where: { isActive: true } }),
    prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } }),
    prisma.attendanceRecord.groupBy({
      by: ['status'],
      where: {
        attendanceSession: {
          date: { gte: today, lt: new Date(today.getTime() + 86_400_000) },
        },
      },
      _count: { _all: true },
    }),
    prisma.invoice.aggregate({
      where: { issueDate: { gte: monthStart }, status: { notIn: ['CANCELLED', 'DRAFT'] } },
      _sum: { totalAmount: true },
    }),
    prisma.payment.aggregate({
      where: { paidAt: { gte: monthStart }, status: 'CONFIRMED' },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: {
        paidAt: { gte: today, lt: new Date(today.getTime() + 86_400_000) },
        status: 'CONFIRMED',
      },
      _sum: { amount: true },
    }),
    prisma.invoice.aggregate({
      where: { status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] }, balance: { gt: 0 } },
      _sum: { balance: true },
    }),
    prisma.invoice.aggregate({
      where: { status: 'OVERDUE', balance: { gt: 0 } },
      _sum: { balance: true },
    }),
    prisma.classSection.count({ where: { isActive: true } }),
    prisma.course.count({ where: { isActive: true } }),
    prisma.subject.count({ where: { isActive: true } }),
    prisma.exam.count({
      where: { startDate: { gte: today }, status: { in: ['SCHEDULED', 'ONGOING'] } },
    }),
    prisma.exam.count({ where: { resultStatus: 'PUBLISHED' } }),
    prisma.assignment.count({ where: { status: 'PUBLISHED' } }),
    prisma.assignment.count({
      where: { status: 'PUBLISHED', dueAt: { lt: now } },
    }),
    prisma.studentAlert.count({ where: { isResolved: false } }),
    prisma.studentAlert.count({ where: { isResolved: false, severity: 'CRITICAL' } }),
    prisma.studentAlert.findMany({
      where: { isResolved: false },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      take: 6,
      select: {
        id: true,
        studentId: true,
        title: true,
        severity: true,
        ruleCode: true,
        createdAt: true,
        student: { select: { firstName: true, lastName: true } },
      },
    }),
    notificationQueueStats(),
    academyProgressOverview(),
    prisma.systemEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, level: true, source: true, message: true, createdAt: true },
    }),
  ]);

  const statusCounts = Object.fromEntries(
    todayRecords.map((row) => [row.status, row._count._all]),
  ) as Record<string, number>;

  const presentToday = statusCounts.PRESENT ?? 0;
  const absentToday = statusCounts.ABSENT ?? 0;
  const lateToday = statusCounts.LATE ?? 0;
  const markedToday =
    presentToday + absentToday + lateToday + (statusCounts.EXCUSED ?? 0) + (statusCounts.LEAVE_APPROVED ?? 0);

  const overdueInvoiceCount = await prisma.invoice.count({
    where: { status: 'OVERDUE', balance: { gt: 0 } },
  });

  // Administrative work waiting for someone to act on.
  const pendingAdmissions = await prisma.admissionApplication.count({
    where: { status: 'APPLICANT' },
  });
  const marksAwaitingApproval = await prisma.exam.count({
    where: { resultStatus: 'SUBMITTED' },
  });
  const failedNotifications = queueStats.failed;

  const tasks: OwnerDashboard['tasks'] = [];
  if (pendingAdmissions > 0) {
    tasks.push({
      label: 'Admission applications to review',
      count: pendingAdmissions,
      href: '/admin/admissions',
      tone: 'brand',
    });
  }
  if (marksAwaitingApproval > 0) {
    tasks.push({
      label: 'Result sheets awaiting approval',
      count: marksAwaitingApproval,
      href: '/admin/results',
      tone: 'info',
    });
  }
  if (criticalAlerts > 0) {
    tasks.push({
      label: 'Critical student alerts',
      count: criticalAlerts,
      href: '/admin/alerts',
      tone: 'warning',
    });
  }
  if (failedNotifications > 0) {
    tasks.push({
      label: 'Failed notifications to review',
      count: failedNotifications,
      href: '/admin/notifications?status=FAILED',
      tone: 'warning',
    });
  }
  if (overdueInvoiceCount > 0) {
    tasks.push({
      label: 'Overdue invoices',
      count: overdueInvoiceCount,
      href: '/admin/fees/dues',
      tone: 'warning',
    });
  }

  const collectionPercentage = null;

  void collectionPercentage;
  void feeRules;

  return {
    students: {
      active: activeStudents,
      applicants: applicantCount,
      inactive: inactiveCount,
      newThisMonth,
    },
    staff: {
      teachers: teacherCount,
      activeTeachers: activeTeacherCount,
      supportStaff: supportStaffCount,
    },
    attendance: {
      markedToday,
      presentToday,
      absentToday,
      lateToday,
      percentageToday:
        markedToday > 0
          ? Math.round(((presentToday + lateToday) / markedToday) * 1000) / 10
          : null,
      averageAttendance: progress.averageAttendance,
      belowThreshold: progress.belowThresholdCount,
      threshold: attendanceRules.minimumPercentage,
    },
    finance: {
      currency: academyConfig.currency,
      collectedThisMonth: Number(paymentsThisMonth._sum.amount ?? 0),
      collectedToday: Number(paymentsToday._sum.amount ?? 0),
      outstanding: Number(outstandingRows._sum.balance ?? 0),
      overdue: Number(overdueRows._sum.balance ?? 0),
      overdueInvoiceCount,
      invoicedThisMonth: Number(invoicesThisMonth._sum.totalAmount ?? 0),
    },
    academics: {
      activeClasses,
      activeCourses,
      activeSubjects,
      upcomingExams,
      publishedResults: publishedResultCount,
      averageExamScore: progress.averageExamScore,
    },
    assignments: {
      published: assignmentPublished,
      submissionRate: progress.submissionRate,
      overdue: assignmentOverdue,
    },
    alerts: {
      openAlerts,
      criticalAlerts,
      recentAlerts: recentAlerts.map((alert) => ({
        id: alert.id,
        studentId: alert.studentId,
        studentName: `${alert.student.firstName} ${alert.student.lastName}`.trim(),
        title: alert.title,
        severity: alert.severity,
        ruleCode: alert.ruleCode,
        createdAt: alert.createdAt,
      })),
    },
    notifications: {
      mode: whatsappStatus().mode,
      queued: queueStats.queued,
      failed: queueStats.failed,
      last24hTotal: queueStats.last24hTotal,
      last24hSimulated: queueStats.last24hSimulated,
    },
    activity: recentEvents,
    tasks,
  };
}

/** Enrolment and collection trend series for the dashboard charts. */
export async function buildOwnerTrends(months = 6, now = new Date()) {
  const series: Array<{
    label: string;
    enrolments: number;
    collected: number;
    invoiced: number;
  }> = [];

  for (let index = months - 1; index >= 0; index -= 1) {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index + 1, 1));

    const [enrolments, collected, invoiced] = await Promise.all([
      prisma.enrollment.count({ where: { enrolledAt: { gte: from, lt: to } } }),
      prisma.payment.aggregate({
        where: { paidAt: { gte: from, lt: to }, status: 'CONFIRMED' },
        _sum: { amount: true },
      }),
      prisma.invoice.aggregate({
        where: {
          issueDate: { gte: from, lt: to },
          status: { notIn: ['CANCELLED', 'DRAFT'] },
        },
        _sum: { totalAmount: true },
      }),
    ]);

    series.push({
      label: from.toLocaleString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
      enrolments,
      collected: Number(collected._sum?.amount ?? 0),
      invoiced: Number(invoiced._sum?.totalAmount ?? 0),
    });
  }

  return series;
}

/** Class-by-class performance and attendance comparison. */
export async function buildClassComparison() {
  const classes = await prisma.classSection.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      capacity: true,
      course: { select: { name: true, code: true } },
      _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
    },
    orderBy: { name: 'asc' },
  });



  const perClass: Array<{
    id: string;
    name: string;
    course: string;
    enrolled: number;
    capacity: number;
    fillRate: number;
    attendancePercentage: number | null;
    averageScore: number | null;
  }> = [];

  for (const section of classes) {
    const [records, results] = await Promise.all([
      prisma.attendanceRecord.groupBy({
        by: ['status'],
        where: { attendanceSession: { classSectionId: section.id } },
        _count: { _all: true },
      }),
      prisma.examResult.findMany({
        where: {
          status: 'SCORED',
          examSubject: { exam: { resultStatus: 'PUBLISHED', classSectionIds: { has: section.id } } },
        },
        select: { percentage: true },
      }),
    ]);

    const totals = Object.fromEntries(
      records.map((r) => [r.status, r._count._all]),
    ) as Record<string, number>;
    const total = Object.values(totals).reduce((a, b) => a + b, 0);
    const attended = total - (totals.ABSENT ?? 0);

    const scores = results
      .map((r) => (r.percentage === null ? null : Number(r.percentage.toString())))
      .filter((p): p is number => p !== null);

    perClass.push({
      id: section.id,
      name: section.name,
      course: section.course.name,
      enrolled: section._count.enrollments,
      capacity: section.capacity,
      fillRate:
        section.capacity > 0
          ? Math.round((section._count.enrollments / section.capacity) * 1000) / 10
          : 0,
      attendancePercentage:
        total > 0 ? Math.round((attended / total) * 1000) / 10 : null,
      averageScore:
        scores.length > 0
          ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
          : null,
    });
  }



  return perClass;
}
