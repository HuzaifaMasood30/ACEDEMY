'use client';

import * as React from 'react';
import { CalendarClock } from 'lucide-react';
import {
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  TableWrap,
  Td,
  Th,
  Tr,
} from '@/components/ui/structure';
import { Alert, Badge, Button } from '@/components/ui/primitives';
import { ChildSelector, usePortalContext } from './portal-context';
import { api } from '@/lib/client-api';

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
const DAY_LABELS: Record<string, string> = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
  SUNDAY: 'Sunday',
};

interface Slot {
  id: string;
  startMinute: number;
  endMinute: number;
  subjectName: string | null;
  teacherName?: string | null;
  roomName?: string | null;
  className?: string | null;
  isBreak?: boolean;
}

/** One normalised lesson, whichever scope produced it. */
interface NormalisedSlot extends Slot {
  day: string;
}

function formatTime(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

/**
 * The teacher scope returns `{ today, weekly }`; the class scope returns
 * `[{ day, slots }]`. Both are flattened to a single list of day-tagged slots so
 * the rest of the page has one shape to render.
 */
function normalise(payload: unknown): NormalisedSlot[] {
  if (Array.isArray(payload)) {
    const out: NormalisedSlot[] = [];
    for (const group of payload as { day: string; slots: Slot[] }[]) {
      for (const slot of group.slots ?? []) {
        if (slot.isBreak) continue;
        out.push({ ...slot, day: group.day });
      }
    }
    return out;
  }

  if (payload && typeof payload === 'object') {
    const weekly = (payload as { weekly?: (Slot & { dayOfWeek: string })[] }).weekly ?? [];
    return weekly.map((slot) => ({ ...slot, day: slot.dayOfWeek }));
  }

  return [];
}

/** Weekly timetable shared by the teacher, student and parent portals. */
export function TimetableClient() {
  const context = usePortalContext();
  const [slots, setSlots] = React.useState<NormalisedSlot[]>([]);
  const [classSectionId, setClassSectionId] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const isTeacher = context.scope === 'teacher';
  const focusClassId = context.student?.enrollments[0]?.classSection.id;

  React.useEffect(() => {
    if (context.loading) return;

    if (!isTeacher && !focusClassId) {
      setLoading(false);
      setSlots([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const request = isTeacher
      ? api.getOne<unknown>('/api/admin/timetable', {
          scope: 'teacher',
          classSectionId: classSectionId || undefined,
        })
      : api.getOne<unknown>('/api/admin/timetable', {
          scope: 'class',
          classSectionId: classSectionId || focusClassId,
        });

    request
      .then((payload) => {
        if (!cancelled) {
          setSlots(normalise(payload));
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
  }, [context.loading, isTeacher, focusClassId, classSectionId]);

  const byDay = React.useMemo(() => {
    const grouped = new Map<string, NormalisedSlot[]>();
    for (const slot of slots) {
      const list = grouped.get(slot.day) ?? [];
      list.push(slot);
      grouped.set(slot.day, list);
    }
    for (const list of grouped.values()) list.sort((a, b) => a.startMinute - b.startMinute);
    return grouped;
  }, [slots]);

  const classOptions = React.useMemo(
    () => context.classes.map((entry) => entry.classSection),
    [context.classes],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Timetable"
        description={
          isTeacher
            ? 'Your teaching schedule for the week.'
            : context.student
              ? `Weekly schedule for ${context.student.firstName} ${context.student.lastName}.`
              : 'Weekly class schedule.'
        }
        actions={<ChildSelector context={context} />}
      />

      {error && <Alert tone="danger" title="Could not load the timetable">{error}</Alert>}

      {isTeacher && classOptions.length > 0 && (
        <Card>
          <CardHeader title="Filter by class" icon={<CalendarClock />} />
          <div className="p-4 sm:p-5">
            <label htmlFor="tt-class" className="mb-1.5 block text-xs font-medium text-[var(--ink-muted)]">
              Class
            </label>
            <select
              id="tt-class"
              value={classSectionId}
              onChange={(event) => setClassSectionId(event.target.value)}
              className="w-full max-w-sm rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
            >
              <option value="">All my classes</option>
              {classOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="skeleton h-56 rounded-xl" />
          ))}
        </div>
      ) : slots.length === 0 ? (
        <Card>
          <div className="p-5">
            <EmptyState
              icon={<CalendarClock />}
              title="No scheduled lessons"
              description="Once the academy publishes a timetable for this class, lessons will appear here."
            />
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {DAYS.filter((day) => byDay.has(day)).map((day) => (
            <Card key={day}>
              <CardHeader
                title={DAY_LABELS[day]}
                action={
                  <Badge tone="neutral">
                    {byDay.get(day)!.length} lesson{byDay.get(day)!.length === 1 ? '' : 's'}
                  </Badge>
                }
              />
              <ul className="divide-y divide-[var(--line)]">
                {byDay.get(day)!.map((slot) => (
                  <li key={slot.id} className="flex items-start gap-3 p-4">
                    <div className="w-20 shrink-0 tabular text-xs font-medium text-[var(--ink-muted)]">
                      {formatTime(slot.startMinute)}
                      <div className="text-[var(--ink-subtle)]">{formatTime(slot.endMinute)}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--ink)]">
                        {slot.subjectName ?? 'Lesson'}
                      </p>
                      <p className="truncate text-xs text-[var(--ink-muted)]">
                        {[slot.className, slot.teacherName, slot.roomName].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {slots.length > 0 && (
        <Card>
          <CardHeader title="Full schedule" description="Every lesson in a single table." />
          <TableWrap>
            <thead>
              <tr>
                <Th>Day</Th>
                <Th>Time</Th>
                <Th>Subject</Th>
                <Th hideBelow="md">Class</Th>
                <Th hideBelow="md">Teacher</Th>
                <Th hideBelow="lg">Room</Th>
              </tr>
            </thead>
            <tbody>
              {DAYS.flatMap((day) => byDay.get(day) ?? []).map((slot) => (
                <Tr key={slot.id}>
                  <Td>{DAY_LABELS[slot.day]}</Td>
                  <Td>
                    <span className="tabular">
                      {formatTime(slot.startMinute)}–{formatTime(slot.endMinute)}
                    </span>
                  </Td>
                  <Td>{slot.subjectName ?? '—'}</Td>
                  <Td hideBelow="md">{slot.className ?? '—'}</Td>
                  <Td hideBelow="md">{slot.teacherName ?? '—'}</Td>
                  <Td hideBelow="lg">{slot.roomName ?? '—'}</Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}

      <div className="flex justify-end">
        <Button variant="ghost" onClick={context.reload} loading={context.loading}>
          Refresh
        </Button>
      </div>
    </div>
  );
}
