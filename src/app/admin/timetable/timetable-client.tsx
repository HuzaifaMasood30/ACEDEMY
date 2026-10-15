'use client';

import * as React from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CalendarX2,
  Clock,
  DoorOpen,
  RefreshCw,
  UserCog,
} from 'lucide-react';
import { Alert, Badge, Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/structure';
import { DataTable, type Column } from '@/components/ui/data-table';
import { ConfirmDialog, Modal, Tabs } from '@/components/ui/overlays';
import { api } from '@/lib/client-api';
import { useMutation, useResource } from '@/lib/use-resource';
import { formatNumber, formatTime, titleCase } from '@/lib/format';

const DAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

interface Slot {
  id: string;
  startMinute: number;
  endMinute: number;
  subjectName: string | null;
  subjectCode: string | null;
  teacherName: string;
  isSubstitute: boolean;
  roomName: string | null;
  batchName: string | null;
  isBreak: boolean;
}

interface DaySchedule {
  day: string;
  slots: Slot[];
}

interface Conflict {
  kind: string;
  message: string;
  detail?: Record<string, unknown>;
}

interface Options {
  classes: Array<{ id: string; name: string; course: { name: string } }>;
  teachers: Array<{ id: string; user: { name: string }; maxWeeklyPeriods: number | null }>;
  subjects: Array<{ id: string; name: string; code: string }>;
  rooms: Array<{ id: string; name: string; capacity: number | null }>;
  sessions: Array<{ id: string; name: string; isCurrent: boolean }>;
}

interface WorkloadRow {
  teacherProfileId: string;
  name: string;
  designation: string | null;
  weeklyPeriods: number;
  weeklyHours: number;
  maxWeeklyPeriods: number | null;
  utilisation: number;
  distinctClasses: number;
  subjectCount: number;
  isOverloaded: boolean;
}

const emptyForm = () => ({
  subjectId: '',
  teacherProfileId: '',
  roomId: '',
  dayOfWeek: 'MONDAY',
  startTime: '08:00',
  endTime: '08:50',
  effectiveFrom: new Date().toISOString().slice(0, 10),
  isBreak: false,
  label: '',
});

export function TimetableClient() {
  const [tab, setTab] = React.useState<'week' | 'workload'>('week');
  const [classSectionId, setClassSectionId] = React.useState('');
  const [options, setOptions] = React.useState<Options | null>(null);
  const [schedule, setSchedule] = React.useState<DaySchedule[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);

  const [addOpen, setAddOpen] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm());
  const [conflicts, setConflicts] = React.useState<Conflict[] | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [confirmOverride, setConfirmOverride] = React.useState(false);

  const [cancelSlot, setCancelSlot] = React.useState<Slot | null>(null);
  const [cancelReason, setCancelReason] = React.useState('');
  const [subSlot, setSubSlot] = React.useState<Slot | null>(null);
  const [subForm, setSubForm] = React.useState({ teacherProfileId: '', reason: '' });

  const { run, pending } = useMutation();

  const workload = useResource<WorkloadRow>('/api/admin/analytics', {
    params: { scope: 'workload' },
    enabled: tab === 'workload',
  });

  React.useEffect(() => {
    api
      .getOne<Options>('/api/admin/timetable', { scope: 'options' })
      .then((data) => {
        setOptions(data);
        setClassSectionId((prev) => prev || data.classes[0]?.id || '');
      })
      .catch(() => setError('Could not load timetable options.'));
  }, []);

  React.useEffect(() => {
    if (!classSectionId) return;
    setLoading(true);
    api
      .getOne<DaySchedule[]>('/api/admin/timetable', { scope: 'class', classSectionId })
      .then((data) => {
        setSchedule(Array.isArray(data) ? data : []);
        setError(null);
      })
      .catch(() => setError('Could not load this timetable.'))
      .finally(() => setLoading(false));
  }, [classSectionId, nonce]);

  const slotPayload = (overrides: Partial<ReturnType<typeof emptyForm>> = {}) => {
    const values = { ...form, ...overrides };
    return {
      classSectionId,
      subjectId: values.subjectId || null,
      teacherProfileId: values.teacherProfileId,
      roomId: values.roomId || null,
      dayOfWeek: values.dayOfWeek,
      startTime: values.startTime,
      endTime: values.endTime,
      effectiveFrom: values.effectiveFrom,
      isBreak: values.isBreak,
      label: values.isBreak ? values.label || 'Break' : null,
      allowConflicts: false,
    };
  };

  const checkConflicts = async () => {
    if (!form.teacherProfileId || !classSectionId) return;
    setChecking(true);
    try {
      const found = await api.patch<{ hasConflicts: boolean; conflicts: Conflict[] }>(
        '/api/admin/timetable',
        slotPayload(),
      );
      setConflicts(found?.conflicts ?? []);
    } catch {
      setConflicts(null);
    } finally {
      setChecking(false);
    }
  };

  const createSlot = async (allowConflicts: boolean) => {
    const result = await run<{ slotId: string; conflicts: Conflict[] }>(
      () => api.post('/api/admin/timetable', { ...slotPayload(), allowConflicts }),
      { success: 'Lesson added to the timetable.' },
    );
    if (result) {
      setAddOpen(false);
      setForm(emptyForm());
      setConflicts(null);
      setConfirmOverride(false);
      setNonce((n) => n + 1);
    }
  };

  const submitSlot = async () => {
    if (conflicts === null) {
      await checkConflicts();
      return;
    }
    if (conflicts.length > 0) {
      setConfirmOverride(true);
      return;
    }
    await createSlot(false);
  };

  const doCancel = async () => {
    if (!cancelSlot) return;
    const result = await run(
      () =>
        api.put('/api/admin/timetable', {
          action: 'cancel',
          slotId: cancelSlot.id,
          reason: cancelReason.trim(),
          notify: true,
        }),
      { success: 'Lesson cancelled. Guardians were notified.' },
    );
    if (result) {
      setCancelSlot(null);
      setCancelReason('');
      setNonce((n) => n + 1);
    }
  };

  const doSubstitute = async () => {
    if (!subSlot) return;
    const result = await run(
      () =>
        api.put('/api/admin/timetable', {
          action: 'substitute',
          slotId: subSlot.id,
          substituteTeacherProfileId: subForm.teacherProfileId,
          date: new Date().toISOString().slice(0, 10),
          reason: subForm.reason.trim() || undefined,
          notify: true,
        }),
      { success: 'Substitute teacher assigned.' },
    );
    if (result) {
      setSubSlot(null);
      setSubForm({ teacherProfileId: '', reason: '' });
      setNonce((n) => n + 1);
    }
  };

  const workloadColumns: Column<WorkloadRow>[] = [
    {
      key: 'name',
      header: 'Teacher',
      cell: (row) => (
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium text-[var(--ink)]">{row.name}</span>
          <span className="block truncate text-xs text-[var(--ink-subtle)]">
            {row.designation ?? 'Teacher'}
          </span>
        </div>
      ),
    },
    {
      key: 'weeklyPeriods',
      header: 'Periods / week',
      align: 'right',
      cell: (row) => (
        <span className="tabular text-sm">
          {row.weeklyPeriods}
          {row.maxWeeklyPeriods ? ` / ${row.maxWeeklyPeriods}` : ''}
        </span>
      ),
    },
    {
      key: 'weeklyHours',
      header: 'Teaching hours',
      align: 'right',
      hideBelow: 'sm',
      cell: (row) => <span className="tabular text-sm">{row.weeklyHours}</span>,
    },
    {
      key: 'distinctClasses',
      header: 'Classes',
      align: 'right',
      hideBelow: 'md',
      cell: (row) => <span className="tabular text-sm">{row.distinctClasses}</span>,
    },
    {
      key: 'subjectCount',
      header: 'Subjects',
      align: 'right',
      hideBelow: 'md',
      cell: (row) => <span className="tabular text-sm">{row.subjectCount}</span>,
    },
    {
      key: 'utilisation',
      header: 'Utilisation',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Badge tone={row.isOverloaded ? 'danger' : row.utilisation >= 80 ? 'warning' : 'success'}>
            {row.maxWeeklyPeriods ? `${formatNumber(row.utilisation)}%` : 'No cap'}
          </Badge>
          {row.isOverloaded && (
            <span className="text-[0.6875rem] text-[var(--danger)]">Over capacity</span>
          )}
        </div>
      ),
    },
  ];

  const activeDays = schedule.filter((d) => d.slots.length > 0);
  const totalPeriods = schedule.reduce((sum, d) => sum + d.slots.filter((s) => !s.isBreak).length, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Timetable"
        description="Weekly schedules by class, with teacher, room and batch conflict detection on the server."
        breadcrumbs={[{ label: 'Academics' }, { label: 'Timetable' }]}
        actions={
          <>
            <Button variant="outline" onClick={() => setNonce((n) => n + 1)}>
              <RefreshCw />
              Refresh
            </Button>
            <Button onClick={() => setAddOpen(true)} disabled={!classSectionId}>
              <CalendarClock />
              Add lesson
            </Button>
          </>
        }
      />

      {error && (
        <Alert tone="danger" title="Timetable unavailable">
          {error}
        </Alert>
      )}

      <Tabs
        tabs={[
          { value: 'week', label: 'Weekly schedule' },
          { value: 'workload', label: 'Teacher workload' },
        ]}
        value={tab}
        onChange={(value) => setTab(value as 'week' | 'workload')}
      />

      {tab === 'week' && (
        <>
          <Card>
            <div className="flex flex-wrap items-end gap-3 p-4 sm:p-5">
              <Field label="Class / batch" htmlFor="tt-class" className="min-w-[16rem] flex-1">
                <Select
                  id="tt-class"
                  value={classSectionId}
                  onChange={(e) => setClassSectionId(e.target.value)}
                >
                  {(options?.classes ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.course.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-center gap-2 pb-1">
                <Badge tone="brand">{totalPeriods} periods / week</Badge>
                <Badge tone="info">{activeDays.length} active days</Badge>
              </div>
            </div>
          </Card>

          {loading ? (
            <Card>
              <div className="space-y-2 p-5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-16 rounded-lg" />
                ))}
              </div>
            </Card>
          ) : activeDays.length === 0 ? (
            <EmptyState
              icon={<CalendarClock />}
              title="No lessons scheduled"
              description="Add the first lesson to build this class's weekly timetable."
              action={
                <Button onClick={() => setAddOpen(true)}>
                  <CalendarClock />
                  Add lesson
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {activeDays.map((day) => (
                <Card key={day.day}>
                  <CardHeader
                    title={titleCase(day.day)}
                    description={`${day.slots.filter((s) => !s.isBreak).length} period(s)`}
                    icon={<Clock />}
                  />
                  <ul className="divide-y divide-[var(--line)]">
                    {day.slots.map((slot) => (
                      <li key={slot.id} className="flex items-start gap-3 p-3.5">
                        <div className="tabular w-24 shrink-0 pt-0.5 text-xs text-[var(--ink-muted)]">
                          {formatTime(slot.startMinute)}–{formatTime(slot.endMinute)}
                        </div>
                        <div className="min-w-0 flex-1">
                          {slot.isBreak ? (
                            <Badge tone="neutral">{slot.subjectName ?? 'Break'}</Badge>
                          ) : (
                            <>
                              <p className="truncate text-sm font-medium text-[var(--ink)]">
                                {slot.subjectName ?? 'Untitled'}
                              </p>
                              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--ink-subtle)]">
                                <span>{slot.teacherName}</span>
                                {slot.roomName && (
                                  <span className="inline-flex items-center gap-0.5">
                                    <DoorOpen className="size-3" />
                                    {slot.roomName}
                                  </span>
                                )}
                              </p>
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {slot.isSubstitute && <Badge tone="warning">Substitute</Badge>}
                                {slot.batchName && <Badge tone="info">{slot.batchName}</Badge>}
                              </div>
                            </>
                          )}
                        </div>
                        {!slot.isBreak && (
                          <div className="flex shrink-0 flex-col gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSubSlot(slot)}
                              title="Assign a substitute teacher"
                            >
                              <UserCog className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setCancelSlot(slot)}
                              title="Cancel this lesson"
                            >
                              <CalendarX2 className="size-3.5" />
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'workload' && (
        <>
          {workload.error && (
            <Alert tone="danger" title="Workload unavailable">
              {workload.error}
            </Alert>
          )}
          <DataTable<WorkloadRow>
            columns={workloadColumns}
            rows={workload.rows}
            rowKey={(row) => row.teacherProfileId}
            loading={workload.loading}
            emptyTitle="No teaching load recorded"
            emptyDescription="Assign teachers to timetable slots to see their weekly load."
            toolbarExtra={
              <Button
                variant="outline"
                size="sm"
                onClick={workload.reload}
                loading={workload.refreshing}
              >
                <RefreshCw />
                Refresh
              </Button>
            }
          />
        </>
      )}

      <Modal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setConflicts(null);
        }}
        title="Add a lesson"
        description="Conflicts with teachers, rooms or batches are checked before saving."
        size="lg"
        dismissOnBackdrop={false}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setAddOpen(false);
                setConflicts(null);
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={checkConflicts}
              loading={checking}
              disabled={!form.teacherProfileId}
            >
              Check conflicts
            </Button>
            <Button
              onClick={submitSlot}
              loading={pending}
              disabled={!form.teacherProfileId || !form.subjectId}
            >
              {conflicts === null ? 'Check & save' : 'Save lesson'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {conflicts !== null && conflicts.length > 0 && (
            <Alert tone="warning" title={`${conflicts.length} scheduling conflict(s) detected`}>
              <ul className="mt-1 space-y-1">
                {conflicts.map((c, i) => (
                  <li key={i}>
                    <Badge tone="warning">{titleCase(c.kind)}</Badge> {c.message}
                  </li>
                ))}
              </ul>
            </Alert>
          )}

          {conflicts !== null && conflicts.length === 0 && (
            <Alert tone="success" title="No conflicts found">
              This slot is free to schedule.
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Subject" htmlFor="slot-subject" required>
              <Select
                id="slot-subject"
                value={form.subjectId}
                onChange={(e) => {
                  setForm((p) => ({ ...p, subjectId: e.target.value }));
                  setConflicts(null);
                }}
              >
                <option value="">Choose a subject…</option>
                {(options?.subjects ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Teacher" htmlFor="slot-teacher" required>
              <Select
                id="slot-teacher"
                value={form.teacherProfileId}
                onChange={(e) => {
                  setForm((p) => ({ ...p, teacherProfileId: e.target.value }));
                  setConflicts(null);
                }}
              >
                <option value="">Choose a teacher…</option>
                {(options?.teachers ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.user.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Room" htmlFor="slot-room">
              <Select
                id="slot-room"
                value={form.roomId}
                onChange={(e) => {
                  setForm((p) => ({ ...p, roomId: e.target.value }));
                  setConflicts(null);
                }}
              >
                <option value="">No room</option>
                {(options?.rooms ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.capacity ? ` (${r.capacity} seats)` : ''}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Day" htmlFor="slot-day" required>
              <Select
                id="slot-day"
                value={form.dayOfWeek}
                onChange={(e) => {
                  setForm((p) => ({ ...p, dayOfWeek: e.target.value }));
                  setConflicts(null);
                }}
              >
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {titleCase(d)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Start time" htmlFor="slot-start" required>
              <Input
                id="slot-start"
                type="time"
                value={form.startTime}
                onChange={(e) => {
                  setForm((p) => ({ ...p, startTime: e.target.value }));
                  setConflicts(null);
                }}
              />
            </Field>

            <Field label="End time" htmlFor="slot-end" required>
              <Input
                id="slot-end"
                type="time"
                value={form.endTime}
                onChange={(e) => {
                  setForm((p) => ({ ...p, endTime: e.target.value }));
                  setConflicts(null);
                }}
              />
            </Field>

            <Field label="Effective from" htmlFor="slot-from" required>
              <Input
                id="slot-from"
                type="date"
                value={form.effectiveFrom}
                onChange={(e) => setForm((p) => ({ ...p, effectiveFrom: e.target.value }))}
              />
            </Field>

            <Field label="Label (for breaks)" htmlFor="slot-label" hint="Only used for break slots.">
              <Input
                id="slot-label"
                value={form.label}
                onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                placeholder="Lunch break"
              />
            </Field>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmOverride}
        onClose={() => setConfirmOverride(false)}
        onConfirm={() => createSlot(true)}
        title="Save despite conflicts?"
        message={
          <>
            This lesson overlaps with {conflicts?.length ?? 0} existing session(s). Saving anyway
            records the override in the audit log. Review the conflicts above first.
          </>
        }
        confirmLabel="Save anyway"
        tone="primary"
        loading={pending}
      />

      <Modal
        open={cancelSlot !== null}
        onClose={() => setCancelSlot(null)}
        title="Cancel this lesson"
        description="Guardians of enrolled students are notified of the cancellation."
        size="sm"
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelSlot(null)} disabled={pending}>
              Keep lesson
            </Button>
            <Button
              variant="danger"
              onClick={doCancel}
              loading={pending}
              disabled={cancelReason.trim().length < 3}
            >
              Cancel lesson
            </Button>
          </>
        }
      >
        <Field
          label="Reason"
          htmlFor="cancel-reason"
          required
          hint="Shared with guardians, so keep it factual."
        >
          <Textarea
            id="cancel-reason"
            rows={3}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Teacher unavailable due to a training workshop."
          />
        </Field>
      </Modal>

      <Modal
        open={subSlot !== null}
        onClose={() => setSubSlot(null)}
        title="Assign a substitute teacher"
        description={subSlot ? `${subSlot.subjectName} — ${subSlot.teacherName}` : undefined}
        size="sm"
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="outline" onClick={() => setSubSlot(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              onClick={doSubstitute}
              loading={pending}
              disabled={!subForm.teacherProfileId}
            >
              Assign substitute
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="info" title="Substitution is recorded, not permanent">
            The original teacher keeps the slot; this change covers the given date only and is
            written to the audit log.
          </Alert>
          <Field label="Substitute teacher" htmlFor="sub-teacher" required>
            <Select
              id="sub-teacher"
              value={subForm.teacherProfileId}
              onChange={(e) => setSubForm((p) => ({ ...p, teacherProfileId: e.target.value }))}
            >
              <option value="">Choose a teacher…</option>
              {(options?.teachers ?? [])
                .filter((t) => t.user.name !== subSlot?.teacherName)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.user.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Reason" htmlFor="sub-reason">
            <Input
              id="sub-reason"
              value={subForm.reason}
              onChange={(e) => setSubForm((p) => ({ ...p, reason: e.target.value }))}
              placeholder="Original teacher on leave"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
