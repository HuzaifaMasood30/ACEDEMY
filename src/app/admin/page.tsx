import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  Megaphone,
  MessageCircle,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { Badge, Button, Progress } from '@/components/ui/primitives';
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
import {
  ComparisonBarChart,
  DonutChart,
  TrendChart,
} from '@/components/ui/charts';
import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { buildClassComparison, buildOwnerDashboard, buildOwnerTrends } from '@/server/services/dashboard';
import { formatDate, formatMoney, formatRelativeTime, formatNumber } from '@/lib/format';

export const metadata = { title: 'Dashboard' };

export default async function AdminDashboardPage() {
  await requirePagePermission(PERMISSIONS.ACADEMY_VIEW);

  const [data, trends, classes] = await Promise.all([
    buildOwnerDashboard(),
    buildOwnerTrends(6),
    buildClassComparison(),
  ]);

  const { students, staff, attendance, finance, academics, alerts, notifications, tasks } = data;

  const attendanceDonut = [
    { name: 'Present', value: attendance.presentToday, colorIndex: 3 },
    { name: 'Late', value: attendance.lateToday, colorIndex: 4 },
    { name: 'Absent', value: attendance.absentToday, colorIndex: 5 },
  ].filter((entry) => entry.value > 0);

  const trendSeries = [
    { key: 'collected', name: 'Fees collected' },
    { key: 'invoiced', name: 'Fees invoiced' },
  ];

  const classSeries = [
    { key: 'attendancePercentage', name: 'Attendance %', colorIndex: 0 },
    { key: 'averageScore', name: 'Average score %', colorIndex: 1 },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Academy dashboard"
        description={`Live figures for the current academic session. Today is ${formatDate(new Date())}.`}
        breadcrumbs={[{ label: 'Dashboard' }]}
        actions={
          <>
            <Link href="/admin/announcements/new">
              <Button variant="outline">
                <Megaphone />
                New announcement
              </Button>
            </Link>
            <Link href="/admin/reports">
              <Button>
                <TrendingUp />
                Reports
              </Button>
            </Link>
          </>
        }
      />

      {/* Pending work */}
      {tasks.length > 0 && (
        <Card className="border-l-3 border-l-[var(--warn)] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--warn-soft)] text-[var(--warn-soft-ink)]">
                <AlertTriangle className="size-4.5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-[var(--ink)]">
                  {tasks.reduce((sum, task) => sum + task.count, 0)} item
                  {tasks.reduce((sum, task) => sum + task.count, 0) === 1 ? '' : 's'} need
                  attention
                </h2>
                <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                  These are outstanding administrative actions recorded by the system.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {tasks.map((task) => (
              <Link
                key={task.label}
                href={task.href}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3.5 py-2.5 transition-colors hover:border-[var(--brand-ring)] hover:bg-[var(--surface-hover)]"
              >
                <span className="min-w-0 truncate text-sm text-[var(--ink)]">{task.label}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular text-sm font-semibold text-[var(--ink)]">
                    {formatNumber(task.count)}
                  </span>
                  <ArrowRight className="size-3.5 text-[var(--ink-subtle)]" />
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* Key figures */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active students"
          value={formatNumber(students.active)}
          icon={<Users />}
          tone="brand"
          href="/admin/students"
          hint={`${students.newThisMonth} joined this month`}
        />
        <StatCard
          label="Attendance today"
          value={attendance.percentageToday === null ? '—' : `${attendance.percentageToday}%`}
          icon={<ClipboardCheck />}
          tone={
            attendance.percentageToday === null
              ? 'info'
              : attendance.percentageToday >= attendance.threshold
                ? 'success'
                : 'warning'
          }
          href="/admin/attendance"
          hint={
            attendance.markedToday === 0
              ? 'No register marked yet today'
              : `${attendance.presentToday} present, ${attendance.absentToday} absent`
          }
        />
        <StatCard
          label="Collected this month"
          value={formatMoney(finance.collectedThisMonth, finance.currency, { compact: true })}
          icon={<Wallet />}
          tone="success"
          href="/admin/fees/payments"
          hint={`${formatMoney(finance.collectedToday, finance.currency, { compact: true })} today`}
        />
        <StatCard
          label="Outstanding fees"
          value={formatMoney(finance.outstanding, finance.currency, { compact: true })}
          icon={<AlertTriangle />}
          tone={finance.overdue > 0 ? 'warning' : 'info'}
          href="/admin/fees/dues"
          hint={
            finance.overdue > 0
              ? `${formatMoney(finance.overdue, finance.currency, { compact: true })} overdue`
              : 'Nothing overdue'
          }
        />
      </div>

      {/* Charts */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Fee collection and invoicing"
            description="Monthly totals for the last six months"
            icon={<TrendingUp />}
            action={
              <Link href="/admin/reports">
                <Button variant="ghost" size="sm">
                  Details
                  <ArrowRight />
                </Button>
              </Link>
            }
          />
          <div className="p-4 sm:p-5">
            <TrendChart
              data={trends}
              xKey="label"
              series={trendSeries}
              height={280}
              format={{ kind: 'money', currency: finance.currency, compact: true }}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Today's attendance"
            description={
              attendance.markedToday === 0
                ? 'No records marked yet'
                : `${formatNumber(attendance.markedToday)} records marked`
            }
            icon={<ClipboardCheck />}
          />
          <div className="p-4 sm:p-5">
            <DonutChart
              data={attendanceDonut}
              height={260}
              centerValue={
                attendance.percentageToday === null
                  ? '—'
                  : `${attendance.percentageToday}%`
              }
              centerLabel="Present or late"
              format={{ kind: 'number' }}
            />

            <dl className="mt-4 space-y-2 border-t border-[var(--line)] pt-4 text-xs">
              <div className="flex items-center justify-between">
                <dt className="text-[var(--ink-muted)]">Minimum threshold</dt>
                <dd className="tabular font-medium text-[var(--ink)]">
                  {attendance.threshold}%
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[var(--ink-muted)]">Below threshold</dt>
                <dd className="tabular font-medium text-[var(--ink)]">
                  {formatNumber(attendance.belowThreshold)} student
                  {attendance.belowThreshold === 1 ? '' : 's'}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[var(--ink-muted)]">Academy average</dt>
                <dd className="tabular font-medium text-[var(--ink)]">
                  {attendance.averageAttendance === null
                    ? '—'
                    : `${attendance.averageAttendance}%`}
                </dd>
              </div>
            </dl>
          </div>
        </Card>
      </div>

      {/* Class comparison */}
      <Card>
        <CardHeader
          title="Class performance comparison"
          description="Attendance percentage and published examination averages by class"
          icon={<GraduationCap />}
          action={
            <Link href="/admin/analytics">
              <Button variant="ghost" size="sm">
                Analytics
                <ArrowRight />
              </Button>
            </Link>
          }
        />
        <div className="p-4 sm:p-5">
          <ComparisonBarChart
            data={classes.map((row) => ({
              name: row.name,
              attendancePercentage: row.attendancePercentage ?? 0,
              averageScore: row.averageScore ?? 0,
            }))}
            xKey="name"
            series={classSeries}
            layout="vertical"
            height={Math.max(240, classes.length * 42)}
            format={{ kind: 'percent' }}
          />
        </div>
      </Card>

      {/* Two-column detail */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Academic snapshot"
            description="Current session"
            icon={<BookOpen />}
            action={
              <Link href="/admin/exams">
                <Button variant="ghost" size="sm">
                  Examinations
                  <ArrowRight />
                </Button>
              </Link>
            }
          />
          <div className="p-4 sm:p-5">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
              {[
                { label: 'Active classes', value: formatNumber(academics.activeClasses) },
                { label: 'Courses', value: formatNumber(academics.activeCourses) },
                { label: 'Subjects', value: formatNumber(academics.activeSubjects) },
                { label: 'Upcoming exams', value: formatNumber(academics.upcomingExams) },
                {
                  label: 'Published results',
                  value: formatNumber(academics.publishedResults),
                },
                {
                  label: 'Average exam score',
                  value:
                    academics.averageExamScore === null
                      ? '—'
                      : `${academics.averageExamScore}%`,
                },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="text-xs text-[var(--ink-subtle)]">{item.label}</dt>
                  <dd className="tabular mt-1 text-lg font-semibold tracking-tight text-[var(--ink)]">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 space-y-3 border-t border-[var(--line)] pt-4">
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--ink-muted)]">Assignment submission rate</span>
                  <span className="tabular font-medium text-[var(--ink)]">
                    {data.assignments.submissionRate === null
                      ? '—'
                      : `${data.assignments.submissionRate}%`}
                  </span>
                </div>
                <Progress
                  className="mt-1.5"
                  value={data.assignments.submissionRate ?? 0}
                  tone={
                    (data.assignments.submissionRate ?? 0) >= 80
                      ? 'success'
                      : (data.assignments.submissionRate ?? 0) >= 60
                        ? 'brand'
                        : 'warning'
                  }
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--ink-muted)]">Published assignments</span>
                <span className="tabular font-medium text-[var(--ink)]">
                  {formatNumber(data.assignments.published)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--ink-muted)]">Past deadline</span>
                <span className="tabular font-medium text-[var(--ink)]">
                  {formatNumber(data.assignments.overdue)}
                </span>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Staff and messaging"
            description="Workforce and notification channel status"
            icon={<MessageCircle />}
          />
          <div className="p-4 sm:p-5">
            <dl className="grid grid-cols-3 gap-4">
              {[
                { label: 'Teachers', value: formatNumber(staff.activeTeachers) },
                { label: 'Administrators', value: formatNumber(staff.supportStaff) },
                { label: 'Applicants', value: formatNumber(students.applicants) },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="text-xs text-[var(--ink-subtle)]">{item.label}</dt>
                  <dd className="tabular mt-1 text-lg font-semibold tracking-tight text-[var(--ink)]">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 space-y-3 border-t border-[var(--line)] pt-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-[var(--ink-muted)]">WhatsApp adapter</span>
                {notifications.mode === 'cloud' ? (
                  <Badge tone="success">
                    <CheckCircle2 className="size-3.5" />
                    Live credentials
                  </Badge>
                ) : (
                  <Badge tone="warning">
                    <AlertTriangle className="size-3.5" />
                    Mock mode
                  </Badge>
                )}
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--ink-muted)]">Messages last 24 hours</span>
                <span className="tabular font-medium text-[var(--ink)]">
                  {formatNumber(notifications.last24hTotal)}
                </span>
              </div>

              {notifications.mode === 'mock' && notifications.last24hTotal > 0 && (
                <p className="rounded-md border border-[var(--warn)]/25 bg-[var(--warn-soft)] px-3 py-2 text-[0.6875rem] leading-relaxed text-[var(--warn-soft-ink)]">
                  {formatNumber(notifications.last24hSimulated)} of these were simulated by the
                  mock adapter. No message reached a real handset. Add Cloud API credentials to
                  send for real.
                </p>
              )}

              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--ink-muted)]">Queued for sending</span>
                <span className="tabular font-medium text-[var(--ink)]">
                  {formatNumber(notifications.queued)}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--ink-muted)]">Failed deliveries</span>
                <span
                  className={
                    notifications.failed > 0
                      ? 'tabular font-semibold text-[var(--danger)]'
                      : 'tabular font-medium text-[var(--ink)]'
                  }
                >
                  {formatNumber(notifications.failed)}
                </span>
              </div>

              <Link href="/admin/whatsapp" className="block pt-1">
                <Button variant="outline" size="sm" className="w-full">
                  Configure messaging
                  <ArrowRight />
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>

      {/* Alerts and activity */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Student alerts"
            description={`${alerts.openAlerts} open, ${alerts.criticalAlerts} critical`}
            icon={<AlertTriangle />}
            action={
              <Link href="/admin/alerts">
                <Button variant="ghost" size="sm">
                  View all
                  <ArrowRight />
                </Button>
              </Link>
            }
          />

          {alerts.recentAlerts.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 />}
              title="No open alerts"
              description="No student currently breaches an attendance or performance rule."
              className="m-4 border-0"
            />
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {alerts.recentAlerts.map((alert) => (
                <li key={alert.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                  <span
                    className={
                      alert.severity === 'CRITICAL'
                        ? 'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--danger-soft)] text-[var(--danger-soft-ink)]'
                        : 'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--warn-soft)] text-[var(--warn-soft-ink)]'
                    }
                  >
                    <AlertTriangle className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/students/${alert.studentId}`}
                        className="text-sm font-medium text-[var(--ink)] hover:text-[var(--brand)]"
                      >
                        {alert.studentName}
                      </Link>
                      <Badge tone={alert.severity === 'CRITICAL' ? 'danger' : 'warning'}>
                        {alert.severity}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{alert.title}</p>
                    <p className="mt-0.5 text-[0.6875rem] text-[var(--ink-subtle)]">
                      {formatRelativeTime(alert.createdAt)} · rule {alert.ruleCode}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Recent system activity"
            description="Audit and operational events"
            icon={<Activity />}
            action={
              <Link href="/admin/audit">
                <Button variant="ghost" size="sm">
                  Audit log
                  <ArrowRight />
                </Button>
              </Link>
            }
          />
          <ul className="divide-y divide-[var(--line)]">
            {data.activity.map((event) => (
              <li key={event.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                <span
                  className={
                    event.level === 'ERROR'
                      ? 'mt-1.5 size-2 shrink-0 rounded-full bg-[var(--danger)]'
                      : event.level === 'WARN'
                        ? 'mt-1.5 size-2 shrink-0 rounded-full bg-[var(--warn)]'
                        : 'mt-1.5 size-2 shrink-0 rounded-full bg-[var(--ok)]'
                  }
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-[var(--ink)]">{event.message}</p>
                  <p className="mt-0.5 text-[0.6875rem] text-[var(--ink-subtle)]">
                    {event.source} · {formatRelativeTime(event.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Class table */}
      <Card>
        <CardHeader
          title="Class overview"
          description="Enrolment, capacity and performance by class"
          icon={<CalendarClock />}
        />
        <TableWrap>
          <thead>
            <tr>
              <Th>Class</Th>
              <Th>Course</Th>
              <Th align="right">Enrolled</Th>
              <Th align="right">Capacity</Th>
              <Th align="right">Fill rate</Th>
              <Th align="right">Attendance</Th>
              <Th align="right">Avg. score</Th>
            </tr>
          </thead>
          <tbody>
            {classes.map((row) => (
              <Tr key={row.id}>
                <Td>
                  <Link
                    href={`/admin/classes/${row.id}`}
                    className="font-medium text-[var(--ink)] hover:text-[var(--brand)]"
                  >
                    {row.name}
                  </Link>
                </Td>
                <Td className="text-[var(--ink-muted)]">{row.course}</Td>
                <Td align="right" className="tabular">
                  {formatNumber(row.enrolled)}
                </Td>
                <Td align="right" className="tabular text-[var(--ink-muted)]">
                  {formatNumber(row.capacity)}
                </Td>
                <Td align="right">
                  <Badge
                    tone={row.fillRate >= 90 ? 'warning' : row.fillRate >= 60 ? 'success' : 'neutral'}
                  >
                    {row.fillRate}%
                  </Badge>
                </Td>
                <Td align="right" className="tabular">
                  {row.attendancePercentage === null ? (
                    <span className="text-[var(--ink-subtle)]">—</span>
                  ) : (
                    <span
                      className={
                        row.attendancePercentage >= attendance.threshold
                          ? 'text-[var(--ink)]'
                          : 'font-medium text-[var(--danger)]'
                      }
                    >
                      {row.attendancePercentage}%
                    </span>
                  )}
                </Td>
                <Td align="right" className="tabular">
                  {row.averageScore === null ? (
                    <span className="text-[var(--ink-subtle)]">—</span>
                  ) : (
                    `${row.averageScore}%`
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>
    </div>
  );
}
