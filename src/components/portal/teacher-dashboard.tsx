'use client';

import * as React from 'react';
import { BookOpen, CalendarClock, GraduationCap } from 'lucide-react';
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
import { Alert, Badge } from '@/components/ui/primitives';
import { usePortalContext } from '@/components/portal/portal-context';
import { api } from '@/lib/client-api';

interface TodaySlot {
  id: string;
  startMinute: number;
  endMinute: number;
  subjectName?: string | null;
  className?: string | null;
  roomName?: string | null;
}

function formatTime(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

/** Teacher landing page: today's schedule plus the classes they own. */
export function TeacherDashboardClient() {
  const context = usePortalContext();
  const [today, setToday] = React.useState<TodaySlot[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);

    api
      .getOne<{ today?: TodaySlot[] }>('/api/admin/timetable', { scope: 'teacher' })
      .then((payload) => {
        if (!cancelled) {
          setToday(payload.today ?? []);
          setError(null);
        }
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
  }, []);

  const totalStudents = context.classes.reduce(
    (sum, entry) => sum + entry.classSection._count.enrollments,
    0,
  );
  const subjectCount = context.classes.reduce((sum, entry) => sum + entry.subjects.length, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teacher dashboard"
        description="Your classes, schedule and outstanding work."
      />

      {error && <Alert tone="danger" title="Could not load the dashboard">{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="My classes"
          value={context.classes.length}
          icon={<BookOpen />}
          hint={`${totalStudents} students in total`}
        />
        <StatCard label="Subjects" value={subjectCount} icon={<GraduationCap />} />
        <StatCard label="Lessons today" value={today.length} icon={<CalendarClock />} />
      </div>

      <Card>
        <CardHeader
          title="Today's schedule"
          description="Lessons assigned to you today."
          icon={<CalendarClock />}
        />
        {loading ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2].map((index) => (
              <div key={index} className="skeleton h-12 rounded-lg" />
            ))}
          </div>
        ) : today.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<CalendarClock />}
              title="No lessons today"
              description="Your scheduled lessons for today will be listed here."
            />
          </div>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>Subject</Th>
                <Th hideBelow="md">Class</Th>
                <Th hideBelow="lg">Room</Th>
              </tr>
            </thead>
            <tbody>
              {today.map((slot) => (
                <Tr key={slot.id}>
                  <Td>
                    <span className="tabular text-sm">
                      {formatTime(slot.startMinute)}–{formatTime(slot.endMinute)}
                    </span>
                  </Td>
                  <Td>{slot.subjectName ?? '—'}</Td>
                  <Td hideBelow="md">{slot.className ?? '—'}</Td>
                  <Td hideBelow="lg">{slot.roomName ?? '—'}</Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card>
        <CardHeader title="My classes" description="Classes and subjects you are assigned to." />
        {context.loading ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2].map((index) => (
              <div key={index} className="skeleton h-12 rounded-lg" />
            ))}
          </div>
        ) : context.classes.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<BookOpen />}
              title="No classes assigned"
              description="Ask an administrator to assign you to classes and subjects."
            />
          </div>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Class</Th>
                <Th>Course</Th>
                <Th>Subjects</Th>
                <Th>Students</Th>
              </tr>
            </thead>
            <tbody>
              {context.classes.map((entry) => (
                <Tr key={entry.classSection.id}>
                  <Td>
                    <span className="text-sm font-medium text-[var(--ink)]">
                      {entry.classSection.name}
                    </span>
                  </Td>
                  <Td>{entry.classSection.course.name}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {entry.subjects.length === 0 ? (
                        <span className="text-sm text-[var(--ink-subtle)]">—</span>
                      ) : (
                        entry.subjects.map((subject) => (
                          <Badge key={subject.id} tone="brand">
                            {subject.name}
                          </Badge>
                        ))
                      )}
                    </div>
                  </Td>
                  <Td>
                    <span className="tabular text-sm">{entry.classSection._count.enrollments}</span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
