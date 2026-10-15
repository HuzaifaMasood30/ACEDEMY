import { NextResponse } from 'next/server';
import { fail, guard, parseListQuery } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import {
  buildOwnerDashboard,
  buildOwnerTrends,
  buildClassComparison,
} from '@/server/services/dashboard';
import { academyProgressOverview } from '@/server/services/progress';
import { teacherWorkload } from '@/server/services/timetable';
import { notificationQueueStats } from '@/server/notifications/queue';
import { whatsappStatus } from '@/server/whatsapp/adapter';
import { prisma } from '@/lib/prisma';
import { EnrollmentStatus } from '@prisma/client';

/**
 * Dashboard and analytics aggregates.
 *
 * All figures come from the same service functions the server-rendered
 * dashboard uses, so a number never differs between the page and the API.
 */
export async function GET(request: Request) {
  try {
    await guard(PERMISSIONS.ACADEMY_VIEW);
    const query = parseListQuery(request);
    const scope = query.params.get('scope') ?? 'owner';
    const months = Math.min(Math.max(Number(query.params.get('months') ?? 6), 1), 24);

    if (scope === 'owner') {
      const [dashboard, trends, classes] = await Promise.all([
        buildOwnerDashboard(),
        buildOwnerTrends(months),
        buildClassComparison(),
      ]);

      return NextResponse.json({ data: { dashboard, trends, classes } });
    }

    if (scope === 'progress') {
      return NextResponse.json({
        data: await academyProgressOverview({
          classSectionId: query.params.get('classSectionId') ?? undefined,
        }),
      });
    }

    if (scope === 'workload') {
      return NextResponse.json({ data: await teacherWorkload() });
    }

    if (scope === 'notifications') {
      return NextResponse.json({
        data: { queue: await notificationQueueStats(), whatsapp: whatsappStatus() },
      });
    }

    if (scope === 'enrollmentTrend') {
      // Enrolments per month for the trailing window, computed from admission dates.
      const since = new Date();
      since.setUTCMonth(since.getUTCMonth() - months + 1);
      since.setUTCDate(1);
      since.setUTCHours(0, 0, 0, 0);

      const students = await prisma.student.findMany({
        where: { admissionDate: { gte: since } },
        select: { admissionDate: true },
      });

      const buckets = new Map<string, number>();
      for (const student of students) {
        const key = student.admissionDate.toISOString().slice(0, 7);
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }

      const series: Array<{ month: string; admissions: number }> = [];
      for (let i = 0; i < months; i += 1) {
        const date = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth() + i, 1));
        const key = date.toISOString().slice(0, 7);
        series.push({ month: key, admissions: buckets.get(key) ?? 0 });
      }

      return NextResponse.json({ data: series });
    }

    if (scope === 'classPerformance') {
      const classes = await prisma.classSection.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          _count: { select: { enrollments: { where: { status: EnrollmentStatus.ACTIVE } } } },
        },
      });

      return NextResponse.json({ data: classes });
    }

    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: `Unknown scope "${scope}".`,
        },
      },
      { status: 422 },
    );
  } catch (error) {
    return fail(error, 'analytics GET');
  }
}
