'use client';

import * as React from 'react';
import { CalendarClock, ClipboardCheck, ClipboardList } from 'lucide-react';
import {
  Card,
  CardHeader,
  PageHeader,
  StatCard,
} from '@/components/ui/structure';
import { Alert, Badge, Button } from '@/components/ui/primitives';
import { usePortalContext } from '@/components/portal/portal-context';
import { api, list } from '@/lib/client-api';

interface TodaySlot {
  id: string;
  dayOfWeek: string;
  startMinute: number;
  endMinute: number;
  subjectName?: string | null;
  teacherName?: string | null;
  roomName?: string | null;
}

interface AttendanceSummary {
  percentage: number;
  total: number;
  present: number;
  rules?: { minimumPercentage: number };
}

function formatTime(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

/** Student landing page: today's lessons, attendance and outstanding work. */
export function StudentDashboardClient() {
  const context = usePortalContext();
  const [today, setToday] = React.useState<TodaySlot[]>([]);
  const [attendance, setAttendance] = React.useState<AttendanceSummary | null>(null);
  const [assignments, setAssignments] = React.useState<
    { id: string; title: string; dueAt: string; subject: { name: string } }[]
  >([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const studentId = context.student?.id;
  const classSectionId = context.student?.enrollments[0]?.classSection.id;

  React.useEffect(() => {
    if (context.loading) return;
    if (!studentId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const day = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();

    Promise.all([
      classSectionId
        ? api.getOne<{ weekly?: TodaySlot[] }>('/api/admin/timetable', {
            scope: 'class',
            classSectionId,
          })
        : Promise.resolve({ weekly: [] as TodaySlot[] }),
      api.getOne<{ summary: AttendanceSummary }>('/api/admin/attendance', { studentId, pageSize: 1 }),
      list<{ id: string; title: string; dueAt: string; subject: { name: string } }>('/api/assignments', {
        studentId,
        status: 'PUBLISHED',
        pageSize: 5,
      }),
    ])
      .then(([timetable, attendanceData, assignmentPage]) => {
        if (cancelled) return;
        setToday((timetable.weekly ?? []).filter((slot) => slot.dayOfWeek === day));
        setAttendance(attendanceData.summary);
        setAssignments(assignmentPage.rows);
        setError(null);
      })
      .catch((caught: Error) => {
        if (!cancelled) setError(caught.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [context.loading, studentId, classSectionId]);

  if (!context.loading && !context.student) {
    return (
      <div className="space-y-6">
        <PageHeader title="Student dashboard" />
        <Alert tone="warning" title="No student record linked">
          This account is not linked to a student record. Contact the academy office.
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${context.student?.firstName ?? 'student'}`}
        description={
          context.student?.enrollments[0]
            ? `${context.student.enrollments[0].classSection.name} · ${context.student.enrollments[0].classSection.course.name}`
            : 'Your studies at a glance.'
        }
      />

      {error && <Alert tone="danger" title="Could not load the dashboard">{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Attendance"
          value={attendance ? `${attendance.percentage}%` : '—'}
          hint={
            attendance?.rules
              ? `Minimum required ${attendance.rules.minimumPercentage}%`
              : attendance
                ? `${attendance.present} of ${attendance.total} sessions`
                : undefined
          }
          icon={<ClipboardCheck />}
          tone={
            attendance?.rules && attendance.percentage < attendance.rules.minimumPercentage
              ? 'danger'
              : 'success'
          }
        />
        <StatCard label="Lessons today" value={today.length} icon={<CalendarClock />} />
        <StatCard
          label="Assignments due"
          value={assignments.length}
          icon={<ClipboardList />}
          tone={assignments.length > 0 ? 'warning' : undefined}
        />
      </div>

      <Card>
        <CardHeader title="Today's lessons" icon={<CalendarClock />} />
        {loading ? (
          <div className="space-y-2 p-5">
            {[0, 1].map((index) => (
              <div key={index} className="skeleton h-12 rounded-lg" />
            ))}
          </div>
        ) : today.length === 0 ? (
          <div className="p-5 text-sm text-[var(--ink-muted)]">
            No lessons scheduled for today.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {today.map((slot) => (
              <li key={slot.id} className="flex items-center gap-4 p-4">
                <span className="w-24 shrink-0 tabular text-xs text-[var(--ink-muted)]">
                  {formatTime(slot.startMinute)}
                </span>
                <span className="flex-1 text-sm font-medium text-[var(--ink)]">
                  {slot.subjectName ?? 'Lesson'}
                </span>
                <span className="text-xs text-[var(--ink-subtle)]">
                  {[slot.teacherName, slot.roomName].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Assignments"
          description="Published work you can still submit."
          icon={<ClipboardList />}
          action={
            <Button variant="ghost" size="sm" onClick={() => (window.location.href = '/student/assignments')}>
              View all
            </Button>
          }
        />
        {assignments.length === 0 ? (
          <div className="p-5 text-sm text-[var(--ink-muted)]">Nothing outstanding right now.</div>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {assignments.map((assignment) => {
              const overdue = new Date(assignment.dueAt).getTime() < Date.now();
              return (
                <li key={assignment.id} className="flex items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--ink)]">
                      {assignment.title}
                    </p>
                    <p className="text-xs text-[var(--ink-muted)]">{assignment.subject.name}</p>
                  </div>
                  <Badge tone={overdue ? 'danger' : 'warning'}>
                    {overdue ? 'overdue' : 'due'}{' '}
                    {new Date(assignment.dueAt).toLocaleDateString(undefined, {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
