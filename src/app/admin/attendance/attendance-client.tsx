'use client';

import * as React from 'react';
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  RefreshCw,
  Send,
  UserX,
} from 'lucide-react';
import { Alert, Badge, Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Card, CardHeader, EmptyState, PageHeader, StatCard, TableWrap, Td, Th, Tr } from '@/components/ui/structure';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Modal } from '@/components/ui/overlays';
import { api } from '@/lib/client-api';
import { useMutation, useResource } from '@/lib/use-resource';
import { formatDate, formatNumber, titleCase, todayUtc } from '@/lib/format';

interface RegisterRow {
  studentId: string;
  admissionNo: string;
  name: string;
  photoUrl: string | null;
  status: string;
  remarks: string | null;
  percentage: number | null;
  present: number;
  absent: number;
  late: number;
}

interface SummaryPayload {
  date: string;
  classSectionId: string;
  classSection: { id: string; name: string; course: string } | null;
  rows: RegisterRow[];
  totals: {
    marked: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    leave: number;
    percentage: number | null;
  };
}

interface OptionClass {
  id: string;
  name: string;
  course: { name: string };
  _count: { enrollments: number };
}

const STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'LEAVE'] as const;
type Status = (typeof STATUSES)[number];

const STATUS_TONE: Record<Status, 'success' | 'danger' | 'warning' | 'info' | 'brand'> = {
  PRESENT: 'success',
  ABSENT: 'danger',
  LATE: 'warning',
  EXCUSED: 'info',
  LEAVE: 'brand',
};

export function AttendanceClient() {
  const [classSectionId, setClassSectionId] = React.useState('');
  const [date, setDate] = React.useState(() => todayUtc().toISOString().slice(0, 10));
  const [tab, setTab] = React.useState<'register' | 'low'>('register');
  const [marks, setMarks] = React.useState<Record<string, Status>>({});
  const [remarks, setRemarks] = React.useState<Record<string, string>>({});
  const [correctOpen, setCorrectOpen] = React.useState(false);
  const [correctionTarget, setCorrectionTarget] = React.useState<RegisterRow | null>(null);
  const [correctionStatus, setCorrectionStatus] = React.useState<Status>('PRESENT');
  const [correctionReason, setCorrectionReason] = React.useState('');
  const [classes, setClasses] = React.useState<OptionClass[]>([]);

  const { run, pending } = useMutation();

  React.useEffect(() => {
    api
      .getOne<{ rows: OptionClass[] }>('/api/admin/classes', { pageSize: 200 })
      .then((data) => {
        setClasses(data.rows ?? []);
        if (data.rows?.length && !classSectionId) setClassSectionId(data.rows[0].id);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const register = useResource<SummaryPayload>('/api/admin/attendance', {
    params: { classSectionId, date },
    enabled: Boolean(classSectionId),
  });

  const summary = (register.rows as unknown as SummaryPayload[])[0] ?? null;

  const low = useResource<{
    studentId: string;
    admissionNo: string;
    name: string;
    classSection: string;
    percentage: number;
    present: number;
    absent: number;
  }>('/api/admin/attendance', {
    params: { scope: 'low', threshold: 75 },
    enabled: tab === 'low',
  });

  // Seed the mark controls from whatever the register already holds.
  React.useEffect(() => {
    if (!summary) return;
    const next: Record<string, Status> = {};
    for (const row of summary.rows) {
      next[row.studentId] = (row.status as Status) ?? 'PRESENT';
    }
    setMarks(next);
  }, [summary]);

  const setAll = (status: Status) => {
    if (!summary) return;
    setMarks(Object.fromEntries(summary.rows.map((row) => [row.studentId, status])));
  };

  const save = async () => {
    if (!summary) return;

    const result = await run(
      () =>
        api.post('/api/admin/attendance', {
          classSectionId,
          date,
          entries: summary.rows.map((row) => ({
            studentId: row.studentId,
            status: marks[row.studentId] ?? 'PRESENT',
            remarks: remarks[row.studentId] ?? row.remarks ?? null,
          })),
        }),
      { success: 'Attendance saved.' },
    );

    if (result) {
      setRemarks({});
      register.reload();
    }
  };

  const submitCorrection = async () => {
    if (!correctionTarget) return;

    const result = await run(
      () =>
        api.put('/api/admin/attendance', {
          action: 'correct',
          studentId: correctionTarget.studentId,
          classSectionId,
          date,
          toStatus: correctionStatus,
          reason: correctionReason.trim() || 'Correction by administrator',
        }),
      { success: 'Correction submitted for approval.' },
    );

    if (result) {
      setCorrectOpen(false);
      setCorrectionReason('');
      register.reload();
    }
  };

  const columns: Column<RegisterRow>[] = [
    {
      key: 'name',
      header: 'Student',
      cell: (row) => (
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium text-[var(--ink)]">{row.name}</span>
          <span className="tabular block text-[0.6875rem] text-[var(--ink-subtle)]">
            {row.admissionNo}
          </span>
        </div>
      ),
    },
    {
      key: 'mark',
      header: 'Mark',
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((status) => {
            const active = (marks[row.studentId] ?? 'PRESENT') === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setMarks((prev) => ({ ...prev, [row.studentId]: status }))}
                aria-pressed={active}
                className={
                  active
                    ? 'rounded-md border border-[var(--brand)] bg-[var(--brand-soft)] px-2.5 py-1 text-[0.6875rem] font-semibold text-[var(--brand-soft-ink)]'
                    : 'rounded-md border border-[var(--line)] px-2.5 py-1 text-[0.6875rem] text-[var(--ink-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--ink)]'
                }
              >
                {titleCase(status)}
              </button>
            );
          })}
        </div>
      ),
    },
    {
      key: 'remarks',
      header: 'Remarks',
      hideBelow: 'md',
      cell: (row) => (
        <Input
          value={remarks[row.studentId] ?? row.remarks ?? ''}
          onChange={(e) => setRemarks((prev) => ({ ...prev, [row.studentId]: e.target.value }))}
          placeholder="Optional"
          aria-label={`Remarks for ${row.name}`}
          className="h-8 text-xs"
        />
      ),
    },
    {
      key: 'history',
      header: 'Term so far',
      align: 'right',
      hideBelow: 'lg',
      cell: (row) => (
        <div className="text-right">
          <span className="tabular block text-sm">
            {row.percentage === null ? '—' : `${row.percentage}%`}
          </span>
          <span className="block text-[0.6875rem] text-[var(--ink-subtle)]">
            {row.present}P · {row.absent}A · {row.late}L
          </span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setCorrectionTarget(row);
            setCorrectionStatus(marks[row.studentId] ?? 'PRESENT');
            setCorrectOpen(true);
          }}
        >
          Correct
        </Button>
      ),
    },
  ];

  const lowColumns: Column<{
    studentId: string;
    admissionNo: string;
    name: string;
    classSection: string;
    percentage: number;
    present: number;
    absent: number;
  }>[] = [
    {
      key: 'name',
      header: 'Student',
      cell: (row) => (
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium text-[var(--ink)]">{row.name}</span>
          <span className="tabular block text-[0.6875rem] text-[var(--ink-subtle)]">
            {row.admissionNo}
          </span>
        </div>
      ),
    },
    {
      key: 'classSection',
      header: 'Class',
      hideBelow: 'md',
      cell: (row) => <span className="text-sm text-[var(--ink-muted)]">{row.classSection}</span>,
    },
    {
      key: 'percentage',
      header: 'Attendance',
      align: 'right',
      cell: (row) => (
        <span
          className={
            row.percentage < 60
              ? 'tabular text-sm font-semibold text-[var(--danger)]'
              : 'tabular text-sm font-medium text-[var(--warn)]'
          }
        >
          {row.percentage}%
        </span>
      ),
    },
    {
      key: 'absent',
      header: 'Absences',
      align: 'right',
      cell: (row) => <span className="tabular text-sm">{row.absent}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Mark the daily register, review history and correct past records."
        breadcrumbs={[{ label: 'Academics' }, { label: 'Attendance' }]}
        actions={
          <Button
            variant="outline"
            onClick={() => {
              register.reload();
              low.reload();
            }}
            loading={register.refreshing}
          >
            <RefreshCw />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Marked today"
          value={formatNumber(summary?.totals.marked ?? 0)}
          icon={<ClipboardCheck />}
          tone="brand"
          hint={classSectionId ? 'For the selected class' : 'Choose a class'}
        />
        <StatCard
          label="Present or late"
          value={
            summary?.totals.percentage === null || summary?.totals.percentage === undefined
              ? '—'
              : `${summary.totals.percentage}%`
          }
          icon={<CheckCircle2 />}
          tone="success"
        />
        <StatCard
          label="Absent"
          value={formatNumber(summary?.totals.absent ?? 0)}
          icon={<UserX />}
          tone={summary && summary.totals.absent > 0 ? 'danger' : 'success'}
        />
        <StatCard
          label="Late"
          value={formatNumber(summary?.totals.late ?? 0)}
          icon={<Clock />}
          tone="warning"
        />
      </div>

      <Card>
        <div className="grid gap-4 p-4 sm:grid-cols-3 sm:p-5">
          <Field label="Class" htmlFor="attendance-class" required>
            <Select
              id="attendance-class"
              value={classSectionId}
              onChange={(e) => setClassSectionId(e.target.value)}
            >
              <option value="">Choose a class…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.course.name} ({c._count.enrollments})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Date" htmlFor="attendance-date" required>
            <Input
              id="attendance-date"
              type="date"
              value={date}
              max={todayUtc().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>

          <div className="flex items-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAll('PRESENT')}
              disabled={!summary}
            >
              All present
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAll('ABSENT')} disabled={!summary}>
              All absent
            </Button>
          </div>
        </div>
      </Card>

      {register.error && (
        <Alert tone="danger" title="Could not load the register">
          {register.error}
        </Alert>
      )}

      <div className="flex gap-1 border-b border-[var(--line)]">
        {(
          [
            ['register', 'Daily register'],
            ['low', 'Low attendance'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={
              tab === value
                ? 'border-b-2 border-[var(--brand)] px-3.5 py-2 text-sm font-medium text-[var(--brand)]'
                : 'border-b-2 border-transparent px-3.5 py-2 text-sm font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'register' ? (
        !classSectionId ? (
          <Card>
            <EmptyState
              icon={<CalendarCheck />}
              title="Choose a class"
              description="Select a class and a date to mark or review its register."
              className="border-0"
            />
          </Card>
        ) : (
          <DataTable<RegisterRow>
            columns={columns}
            rows={summary?.rows ?? []}
            rowKey={(row) => row.studentId}
            loading={register.loading}
            emptyTitle="No students enrolled"
            emptyDescription="This class has no active enrolments, so there is nothing to mark."
            toolbarExtra={
              <Button onClick={save} loading={pending} disabled={!summary || summary.rows.length === 0}>
                <Send />
                Save register
              </Button>
            }
          />
        )
      ) : (
        <DataTable
          columns={lowColumns}
          rows={low.rows as never[]}
          rowKey={(row: { studentId: string }) => row.studentId}
          loading={low.loading}
          emptyTitle="No students below the threshold"
          emptyDescription="Every enrolled student is at or above the configured minimum attendance."
        />
      )}

      <Modal
        open={correctOpen}
        onClose={() => setCorrectOpen(false)}
        title="Request an attendance correction"
        description={
          correctionTarget
            ? `${correctionTarget.name} · ${formatDate(date)}`
            : undefined
        }
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCorrectOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submitCorrection} loading={pending}>
              Submit request
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="info">
            Corrections to past records are logged and require approval when the academy enables
            approval for edits.
          </Alert>

          <Field label="Corrected status" htmlFor="correction-status" required>
            <Select
              id="correction-status"
              value={correctionStatus}
              onChange={(e) => setCorrectionStatus(e.target.value as Status)}
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {titleCase(status)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Reason" htmlFor="correction-reason" required>
            <Textarea
              id="correction-reason"
              rows={3}
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              placeholder="e.g. Student arrived after the register was taken"
            />
          </Field>
        </div>
      </Modal>

      <Alert tone="warning" title="Absence notifications">
        Saving a register with an absence queues a WhatsApp message to each verified guardian. The
        queue prevents duplicates, so re-saving the same register does not send the message twice.
      </Alert>

      {summary && summary.rows.length > 0 && (
        <p className="text-xs text-[var(--ink-subtle)]">
          Showing {summary.classSection?.name ?? 'the selected class'} for {formatDate(date)}.{' '}
          {summary.totals.marked === 0
            ? 'No attendance has been recorded for this date yet.'
            : `${summary.totals.marked} record(s) already recorded.`}
        </p>
      )}
    </div>
  );
}

export { AlertTriangle, Badge, TableWrap, Td, Th, Tr };
