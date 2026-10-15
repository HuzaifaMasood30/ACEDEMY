'use client';

import * as React from 'react';
import {
  Activity,
  BellRing,
  BookOpen,
  CalendarClock,
  ClipboardList,
  Coins,
  GraduationCap,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Alert, Badge, Button, Select } from '@/components/ui/primitives';
import {
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
  TableWrap,
  Td,
  Th,
  Tr,
} from '@/components/ui/structure';
import { Tabs } from '@/components/ui/overlays';
import { DonutChart, TrendChart } from '@/components/ui/charts';
import { api } from '@/lib/client-api';
import { useObjectResource, useResource } from '@/lib/use-resource';
import { formatDateTime, formatMoney, formatNumber, formatPercent, titleCase } from '@/lib/format';

interface OwnerPayload {
  dashboard: {
    students: { active: number; applicants: number; inactive: number; newThisMonth: number };
    staff: { teachers: number; activeTeachers: number; supportStaff: number };
    attendance: {
      markedToday: number;
      presentToday: number;
      absentToday: number;
      lateToday: number;
      percentageToday: number | null;
      averageAttendance: number;
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
    assignments: { published: number; submissionRate: number; overdue: number };
    alerts: { openAlerts: number; criticalAlerts: number };
    notifications: {
      mode: string;
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
      createdAt: string;
    }>;
  };
  trends: Array<{ label: string; enrolments: number; collected: number; invoiced: number }>;
  classes: Array<{
    id: string;
    name: string;
    course: string;
    enrolled: number;
    capacity: number | null;
    fillRate: number | null;
    attendancePercentage: number;
    averageScore: number | null;
  }>;
}

interface WorkloadRow {
  teacherProfileId: string;
  name: string;
  email: string;
  designation: string | null;
  weeklyPeriods: number;
  weeklyHours: number;
  maxWeeklyPeriods: number;
  utilisation: number;
  distinctClasses: number;
  subjectCount: number;
  isClassTeacherOf: number;
  isOverloaded: boolean;
}

const LEVEL_TONE: Record<string, 'info' | 'warning' | 'danger' | 'neutral'> = {
  INFO: 'info',
  WARN: 'warning',
  ERROR: 'danger',
  DEBUG: 'neutral',
};

export function AnalyticsClient() {
  const [tab, setTab] = React.useState<'overview' | 'classes' | 'workload' | 'delivery'>(
    'overview',
  );
  const [months, setMonths] = React.useState(6);

  const owner = useObjectResource<OwnerPayload>('/api/admin/analytics', {
    params: { scope: 'owner', months },
  });

  const payload = owner.data;
  const dashboard = payload?.dashboard;

  const workload = useResource<WorkloadRow>('/api/admin/analytics', {
    params: { scope: 'workload' },
    enabled: tab === 'workload',
  });

  const delivery = useObjectResource<{
    queue: {
      queued: number;
      processing: number;
      sent: number;
      delivered: number;
      failed: number;
      last24hTotal: number;
      last24hSimulated: number;
    };
    whatsapp: { mode: string; live: boolean; rateLimitPerMinute: number };
  }>('/api/admin/analytics', {
    params: { scope: 'notifications' },
    enabled: tab === 'delivery',
  });

  const deliveryData = delivery.data;

  if (owner.error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Analytics"
          breadcrumbs={[{ label: 'Insights' }, { label: 'Analytics' }]}
        />
        <Alert tone="danger" title="Analytics unavailable">
          {owner.error}
        </Alert>
      </div>
    );
  }

  const currency = dashboard?.finance.currency ?? 'PKR';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Enrollment, attendance, finance and academic performance across the academy."
        breadcrumbs={[{ label: 'Insights' }, { label: 'Analytics' }]}
        actions={
          <Select
            value={String(months)}
            onChange={(e) => setMonths(Number(e.target.value))}
            aria-label="Trend window"
            className="w-auto"
          >
            <option value="3">Last 3 months</option>
            <option value="6">Last 6 months</option>
            <option value="12">Last 12 months</option>
            <option value="24">Last 24 months</option>
          </Select>
        }
      />

      <Tabs
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'classes', label: 'Class performance' },
          { value: 'workload', label: 'Teacher workload' },
          { value: 'delivery', label: 'Message delivery' },
        ]}
        value={tab}
        onChange={(value) => setTab(value as typeof tab)}
      />

      {tab === 'overview' && (
        <>
          {owner.loading && !dashboard && (
            <Card>
              <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <div key={i} className="skeleton h-24 rounded-xl" />
                ))}
              </div>
            </Card>
          )}

          {dashboard && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Active students"
                  value={formatNumber(dashboard.students.active)}
                  hint={`${formatNumber(dashboard.students.applicants)} applicants · ${formatNumber(
                    dashboard.students.newThisMonth,
                  )} new this month`}
                  icon={<GraduationCap />}
                  tone="brand"
                />
                <StatCard
                  label="Teachers & staff"
                  value={formatNumber(dashboard.staff.teachers + dashboard.staff.supportStaff)}
                  hint={`${formatNumber(dashboard.staff.activeTeachers)} teachers active · ${formatNumber(
                    dashboard.staff.supportStaff,
                  )} support`}
                  icon={<Users />}
                  tone="accent"
                />
                <StatCard
                  label="Average attendance"
                  value={formatPercent(dashboard.attendance.averageAttendance)}
                  hint={`Threshold ${dashboard.attendance.threshold}% · ${formatNumber(
                    dashboard.attendance.belowThreshold,
                  )} below`}
                  icon={<ClipboardList />}
                  tone={
                    dashboard.attendance.averageAttendance >= dashboard.attendance.threshold
                      ? 'success'
                      : 'warning'
                  }
                />
                <StatCard
                  label="Collected this month"
                  value={formatMoney(dashboard.finance.collectedThisMonth, currency)}
                  hint={`${formatMoney(dashboard.finance.outstanding, currency)} outstanding`}
                  icon={<Coins />}
                  tone="success"
                />
                <StatCard
                  label="Overdue fees"
                  value={formatMoney(dashboard.finance.overdue, currency)}
                  hint={`${formatNumber(dashboard.finance.overdueInvoiceCount)} invoice(s) past due`}
                  icon={<Coins />}
                  tone={dashboard.finance.overdue > 0 ? 'danger' : 'success'}
                />
                <StatCard
                  label="Active classes"
                  value={formatNumber(dashboard.academics.activeClasses)}
                  hint={`${formatNumber(dashboard.academics.activeCourses)} courses · ${formatNumber(
                    dashboard.academics.activeSubjects,
                  )} subjects`}
                  icon={<BookOpen />}
                  tone="info"
                />
                <StatCard
                  label="Upcoming exams"
                  value={formatNumber(dashboard.academics.upcomingExams)}
                  hint={`${formatNumber(dashboard.academics.publishedResults)} published results`}
                  icon={<CalendarClock />}
                  tone="accent"
                />
                <StatCard
                  label="Assignments"
                  value={formatNumber(dashboard.assignments.published)}
                  hint={`${formatPercent(dashboard.assignments.submissionRate)} submitted · ${formatNumber(
                    dashboard.assignments.overdue,
                  )} overdue`}
                  icon={<ClipboardList />}
                  tone={dashboard.assignments.overdue > 0 ? 'warning' : 'success'}
                />
              </div>

              <div className="grid gap-5 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader
                    title="Enrollment and collection trend"
                    description={`Monthly admissions, invoiced value and collected value over the last ${months} months.`}
                    icon={<TrendingUp />}
                  />
                  <div className="p-4 sm:p-5">
                    {(payload?.trends ?? []).length > 0 ? (
                      <TrendChart
                        data={(payload?.trends ?? []).map((t) => ({
                          label: t.label,
                          Enrolments: t.enrolments,
                          Invoiced: t.invoiced,
                          Collected: t.collected,
                        }))}
                        xKey="label"
                        series={[
                          { key: 'Enrolments', name: 'Admissions', colorIndex: 0 },
                          { key: 'Invoiced', name: 'Invoiced', colorIndex: 3 },
                          { key: 'Collected', name: 'Collected', colorIndex: 1 },
                        ]}
                        height={280}
                      />
                    ) : (
                      <EmptyState
                        icon={<TrendingUp />}
                        title="No trend data"
                        description="Trends appear once admissions and invoices exist."
                      />
                    )}
                  </div>
                </Card>

                <Card>
                  <CardHeader
                    title="Today's attendance"
                    description="Live snapshot for the current day."
                    icon={<ClipboardList />}
                  />
                  <div className="p-4 sm:p-5">
                    {dashboard.attendance.markedToday > 0 ? (
                      <DonutChart
                        data={[
                          { name: 'Present', value: dashboard.attendance.presentToday },
                          { name: 'Absent', value: dashboard.attendance.absentToday },
                          { name: 'Late', value: dashboard.attendance.lateToday },
                        ]}
                        height={220}
                        centerLabel={formatPercent(dashboard.attendance.percentageToday ?? 0)}
                        centerValue="present"
                      />
                    ) : (
                      <EmptyState
                        icon={<ClipboardList />}
                        title="Not marked yet"
                        description="Attendance for today has not been recorded."
                      />
                    )}
                  </div>
                </Card>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <Card>
                  <CardHeader
                    title="Recent activity"
                    description="Authentication, notification and administrative events."
                    icon={<Activity />}
                  />
                  <div className="divide-y divide-[var(--line)]">
                    {dashboard.activity.slice(0, 8).map((entry) => (
                      <div key={entry.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                        <Badge tone={LEVEL_TONE[entry.level] ?? 'neutral'}>
                          {titleCase(entry.source)}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-[var(--ink)]">{entry.message}</p>
                          <p className="tabular text-[0.6875rem] text-[var(--ink-subtle)]">
                            {formatDateTime(entry.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                    {dashboard.activity.length === 0 && (
                      <div className="p-5">
                        <EmptyState
                          icon={<Activity />}
                          title="No recent activity"
                          description="System events are recorded here as they occur."
                        />
                      </div>
                    )}
                  </div>
                </Card>

                <Card>
                  <CardHeader
                    title="Delivery and alerts"
                    description="Message queue health and outstanding student alerts."
                    icon={<BellRing />}
                  />
                  <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
                    <div>
                      <p className="text-xs text-[var(--ink-subtle)] uppercase">Queue</p>
                      <p className="tabular mt-1 text-2xl font-semibold text-[var(--ink)]">
                        {formatNumber(dashboard.notifications.queued)}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                        {formatNumber(dashboard.notifications.failed)} failed
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--ink-subtle)] uppercase">Last 24 hours</p>
                      <p className="tabular mt-1 text-2xl font-semibold text-[var(--ink)]">
                        {formatNumber(dashboard.notifications.last24hTotal)}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                        {formatNumber(dashboard.notifications.last24hSimulated)} simulated
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--ink-subtle)] uppercase">Open alerts</p>
                      <p className="tabular mt-1 text-2xl font-semibold text-[var(--ink)]">
                        {formatNumber(dashboard.alerts.openAlerts)}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                        {formatNumber(dashboard.alerts.criticalAlerts)} critical
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--ink-subtle)] uppercase">WhatsApp</p>
                      <p className="mt-1">
                        <Badge tone={dashboard.notifications.mode === 'live' ? 'success' : 'warning'}>
                          {titleCase(dashboard.notifications.mode)} mode
                        </Badge>
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                        Average exam score{' '}
                        {dashboard.academics.averageExamScore != null
                          ? formatPercent(dashboard.academics.averageExamScore)
                          : '—'}
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'classes' && (
        <>
          {payload && payload.classes.length > 0 && (
            <Card>
              <CardHeader
                title="Attendance versus average score"
                description="Each class plotted by attendance percentage and mean examination score."
                icon={<BookOpen />}
              />
              <div className="p-4 sm:p-5">
                <TrendChart
                  data={payload.classes.map((c) => ({
                    label: c.name,
                    Attendance: c.attendancePercentage,
                    Score: c.averageScore ?? 0,
                  }))}
                  xKey="label"
                  series={[
                    { key: 'Attendance', name: 'Attendance %', colorIndex: 0 },
                    { key: 'Score', name: 'Average score %', colorIndex: 2 },
                  ]}
                  height={300}
                />
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Class breakdown" icon={<BookOpen />} />
            <TableWrap>
              <thead>
                <tr>
                  <Th>Class</Th>
                  <Th hideBelow="sm">Course</Th>
                  <Th align="right">Enrolled</Th>
                  <Th align="right" hideBelow="sm">
                    Capacity
                  </Th>
                  <Th align="right">Fill</Th>
                  <Th align="right">Attendance</Th>
                  <Th align="right" hideBelow="md">
                    Avg score
                  </Th>
                </tr>
              </thead>
              <tbody>
                {(payload?.classes ?? []).map((c) => (
                  <Tr key={c.id}>
                    <Td>
                      <span className="text-sm font-medium text-[var(--ink)]">{c.name}</span>
                    </Td>
                    <Td hideBelow="sm">
                      <span className="text-xs text-[var(--ink-muted)]">{c.course}</span>
                    </Td>
                    <Td align="right">
                      <span className="tabular text-sm">{c.enrolled}</span>
                    </Td>
                    <Td align="right" hideBelow="sm">
                      <span className="tabular text-sm text-[var(--ink-muted)]">
                        {c.capacity ?? '∞'}
                      </span>
                    </Td>
                    <Td align="right">
                      {c.fillRate != null ? (
                        <Badge
                          tone={c.fillRate >= 90 ? 'danger' : c.fillRate >= 60 ? 'warning' : 'success'}
                        >
                          {formatPercent(c.fillRate)}%
                        </Badge>
                      ) : (
                        <span className="text-xs text-[var(--ink-subtle)]">—</span>
                      )}
                    </Td>
                    <Td align="right">
                      <span className="tabular text-sm">{formatPercent(c.attendancePercentage)}%</span>
                    </Td>
                    <Td align="right" hideBelow="md">
                      <span className="tabular text-sm">
                        {c.averageScore != null ? `${formatPercent(c.averageScore)}%` : '—'}
                      </span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          </Card>
        </>
      )}

      {tab === 'workload' && (
        <>
          {workload.error && (
            <Alert tone="danger" title="Workload unavailable">
              {workload.error}
            </Alert>
          )}
          <Card>
            <CardHeader
              title="Teacher workload"
              description="Weekly periods against each teacher's contracted maximum."
              icon={<Users />}
            />
            <TableWrap>
              <thead>
                <tr>
                  <Th>Teacher</Th>
                  <Th hideBelow="sm">Designation</Th>
                  <Th align="right">Periods</Th>
                  <Th align="right" hideBelow="sm">
                    Hours
                  </Th>
                  <Th align="right">Utilisation</Th>
                  <Th align="right" hideBelow="md">
                    Classes
                  </Th>
                  <Th align="right" hideBelow="md">
                    Subjects
                  </Th>
                </tr>
              </thead>
              <tbody>
                {workload.rows.map((t) => (
                  <Tr key={t.teacherProfileId}>
                    <Td>
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-medium text-[var(--ink)]">
                          {t.name}
                        </span>
                        <span className="block truncate text-[0.6875rem] text-[var(--ink-subtle)]">
                          {t.email}
                        </span>
                      </div>
                    </Td>
                    <Td hideBelow="sm">
                      <span className="text-xs text-[var(--ink-muted)]">
                        {t.designation ?? '—'}
                        {t.isClassTeacherOf > 0 && (
                          <span className="ml-1 text-[var(--brand)]">
                            · class teacher ({t.isClassTeacherOf})
                          </span>
                        )}
                      </span>
                    </Td>
                    <Td align="right">
                      <span className="tabular text-sm">
                        {t.weeklyPeriods} / {t.maxWeeklyPeriods}
                      </span>
                    </Td>
                    <Td align="right" hideBelow="sm">
                      <span className="tabular text-sm text-[var(--ink-muted)]">{t.weeklyHours}</span>
                    </Td>
                    <Td align="right">
                      <Badge
                        tone={t.isOverloaded ? 'danger' : t.utilisation >= 80 ? 'warning' : 'success'}
                      >
                        {t.utilisation}%
                      </Badge>
                    </Td>
                    <Td align="right" hideBelow="md">
                      <span className="tabular text-sm">{t.distinctClasses}</span>
                    </Td>
                    <Td align="right" hideBelow="md">
                      <span className="tabular text-sm">{t.subjectCount}</span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
            {!workload.loading && workload.rows.length === 0 && (
              <div className="p-5">
                <EmptyState
                  icon={<Users />}
                  title="No teachers assigned"
                  description="Workload appears once teachers have timetable periods."
                />
              </div>
            )}
          </Card>
        </>
      )}

      {tab === 'delivery' && (
        <>
          {deliveryData && (
            <>
              <Alert
                tone={deliveryData.whatsapp.live ? 'success' : 'warning'}
                title={
                  deliveryData.whatsapp.live
                    ? 'WhatsApp is connected'
                    : 'WhatsApp is running in mock mode'
                }
              >
                {deliveryData.whatsapp.live
                  ? `Live delivery through the Cloud API at ${deliveryData.whatsapp.rateLimitPerMinute} messages per minute.`
                  : 'Messages are queued and recorded but not sent to real phone numbers. Configure provider credentials to go live.'}
              </Alert>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Queued"
                  value={formatNumber(deliveryData.queue.queued)}
                  hint={`${formatNumber(deliveryData.queue.processing)} processing`}
                  icon={<BellRing />}
                  tone="info"
                />
                <StatCard
                  label="Sent"
                  value={formatNumber(deliveryData.queue.sent)}
                  hint={`${formatNumber(deliveryData.queue.delivered)} confirmed delivered`}
                  icon={<BellRing />}
                  tone="success"
                />
                <StatCard
                  label="Failed"
                  value={formatNumber(deliveryData.queue.failed)}
                  hint="Retried automatically up to the attempt cap"
                  icon={<BellRing />}
                  tone={deliveryData.queue.failed > 0 ? 'danger' : 'success'}
                />
                <StatCard
                  label="Last 24 hours"
                  value={formatNumber(deliveryData.queue.last24hTotal)}
                  hint={`${formatNumber(deliveryData.queue.last24hSimulated)} simulated`}
                  icon={<Activity />}
                  tone="accent"
                />
              </div>

              <Card>
                <CardHeader
                  title="Delivery breakdown"
                  description="Current state of every queued and completed message."
                  icon={<BellRing />}
                />
                <div className="p-4 sm:p-5">
                  <DonutChart
                    data={[
                      { name: 'Sent', value: deliveryData.queue.sent },
                      { name: 'Queued', value: deliveryData.queue.queued },
                      { name: 'Failed', value: deliveryData.queue.failed },
                    ].filter((d) => d.value > 0)}
                    height={240}
                    centerLabel={formatNumber(deliveryData.queue.sent)}
                    centerValue="sent"
                  />
                </div>
              </Card>
            </>
          )}
          {delivery.loading && (
            <Card>
              <div className="space-y-3 p-5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-20 rounded-xl" />
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      <div className="flex justify-end">
        <Button variant="ghost" onClick={() => owner.reload()} loading={owner.loading}>
          Refresh figures
        </Button>
      </div>
    </div>
  );
}
