'use client';

import * as React from 'react';
import { CalendarCheck, CheckCircle2, ClipboardCheck, Save, XCircle } from 'lucide-react';
import { toast } from 'sonner';
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
import { Alert, Badge, Button, Field, Input, Select } from '@/components/ui/primitives';
import { ChildSelector, usePortalContext } from './portal-context';
import { api, list } from '@/lib/client-api';

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | 'LEAVE_APPROVED';

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: 'PRESENT', label: 'Present' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'LATE', label: 'Late' },
  { value: 'EXCUSED', label: 'Excused' },
  { value: 'LEAVE_APPROVED', label: 'Leave approved' },
];

const STATUS_TONE: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'brand'> = {
  PRESENT: 'success',
  ABSENT: 'danger',
  LATE: 'warning',
  EXCUSED: 'info',
  LEAVE_APPROVED: 'brand',
};

interface Summary {
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  leaveApproved: number;
  attended: number;
  percentage: number;
  rules?: { minimumPercentage: number; consecutiveAbsenceThreshold: number };
}

interface RecordRow {
  id: string;
  status: AttendanceStatus;
  lateMinutes: number | null;
  remarks: string | null;
  date: string;
  period: string;
  classSection: { id: string; name: string } | null;
  subject: { id: string; name: string } | null;
}

interface RegisterStudent {
  student: { id: string; admissionNo: string; firstName: string; lastName: string };
  status: AttendanceStatus | null;
  lateMinutes?: number | null;
  remarks?: string | null;
}

interface RegisterRow {
  session: { id: string; date: string; period: string } | null;
  classSection: { id: string; name: string } | null;
  rows: RegisterStudent[];
}

/** Attendance history for a student, plus a marking register for teachers. */
export function AttendanceClient() {
  const context = usePortalContext();
  const isTeacher = context.scope === 'teacher';

  const [history, setHistory] = React.useState<{ summary: Summary | null; records: RecordRow[] }>({
    summary: null,
    records: [],
  });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);

  const studentId = context.student?.id;

  React.useEffect(() => {
    if (isTeacher || !studentId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    api
      .getOne<{ summary: Summary; records: RecordRow[] }>('/api/admin/attendance', {
        studentId,
        page,
        pageSize: 15,
      })
      .then((result) => {
        if (!cancelled) {
          setHistory(result);
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
  }, [isTeacher, studentId, page]);

  if (isTeacher) return <TeacherAttendance />;

  const summary = history.summary;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description={
          context.student
            ? `Attendance history for ${context.student.firstName} ${context.student.lastName}.`
            : 'Attendance history.'
        }
        actions={<ChildSelector context={context} />}
      />

      {error && <Alert tone="danger" title="Could not load attendance">{error}</Alert>}

      {loading && !summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="skeleton h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        summary && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Attendance"
              value={`${summary.percentage}%`}
              hint={
                summary.rules?.minimumPercentage
                  ? summary.percentage >= summary.rules.minimumPercentage
                    ? `Meets the ${summary.rules.minimumPercentage}% requirement`
                    : `Below the ${summary.rules.minimumPercentage}% requirement`
                  : undefined
              }
              icon={<CalendarCheck />}
              tone={
                summary.rules?.minimumPercentage && summary.percentage < summary.rules.minimumPercentage ? 'danger' : 'success'
              }
            />
            <StatCard label="Sessions marked" value={summary.total} icon={<ClipboardCheck />} />
            <StatCard label="Present" value={summary.present} tone="success" />
            <StatCard
              label="Absent"
              value={summary.absent}
              hint={summary.late > 0 ? `${summary.late} late arrivals` : undefined}
              tone={summary.absent > 0 ? 'danger' : undefined}
            />
          </div>
        )
      )}

      <Card>
        <CardHeader title="Daily record" description="Most recent attendance first." />
        {loading ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="skeleton h-10 rounded-lg" />
            ))}
          </div>
        ) : history.records.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<CalendarCheck />}
              title="No attendance recorded"
              description="Attendance will appear here once a teacher marks the register."
            />
          </div>
        ) : (
          <>
            <TableWrap>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Status</Th>
                  <Th hideBelow="md">Class</Th>
                  <Th hideBelow="lg">Subject</Th>
                  <Th hideBelow="lg">Remarks</Th>
                </tr>
              </thead>
              <tbody>
                {history.records.map((record) => (
                  <Tr key={record.id}>
                    <Td>
                      <span className="tabular">
                        {new Date(record.date).toLocaleDateString(undefined, {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[record.status] ?? 'brand'}>
                        {record.status.replace('_', ' ').toLowerCase()}
                      </Badge>
                    </Td>
                    <Td hideBelow="md">{record.classSection?.name ?? '—'}</Td>
                    <Td hideBelow="lg">{record.subject?.name ?? '—'}</Td>
                    <Td hideBelow="lg">
                      {record.remarks ??
                        (record.lateMinutes ? `${record.lateMinutes} min late` : '—')}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
            <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] p-4">
              <span className="text-xs text-[var(--ink-muted)]">Page {page}</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={history.records.length < 15}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

/** The teacher register: pick a class and date, mark everyone, then save. */
function TeacherAttendance() {
  const context = usePortalContext();
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [classSectionId, setClassSectionId] = React.useState('');
  const [rows, setRows] = React.useState<RegisterStudent[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  const classOptions = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const entry of context.classes) {
      seen.set(entry.classSection.id, entry.classSection.name);
    }
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [context.classes]);

  React.useEffect(() => {
    if (!classSectionId && classOptions.length > 0) setClassSectionId(classOptions[0].id);
  }, [classOptions, classSectionId]);

  const loadRegister = React.useCallback(async () => {
    if (!classSectionId) return;
    setLoading(true);
    try {
      const result = await api.getOne<RegisterRow>('/api/admin/attendance', {
        classSectionId,
        date,
      });
      setRows(result.rows ?? []);
      setError(null);
      setLoaded(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the register.');
    } finally {
      setLoading(false);
    }
  }, [classSectionId, date]);

  React.useEffect(() => {
    void loadRegister();
  }, [loadRegister]);

  const setStatus = (studentId: string, status: AttendanceStatus) => {
    setRows((current) =>
      current.map((row) =>
        row.student.id === studentId ? { ...row, status } : row,
      ),
    );
  };

  const markAll = (status: AttendanceStatus) => {
    setRows((current) => current.map((row) => ({ ...row, status })));
  };

  const save = async () => {
    const entries = rows
      .filter((row) => row.status)
      .map((row) => ({
        studentId: row.student.id,
        status: row.status as AttendanceStatus,
        lateMinutes: row.lateMinutes ?? null,
        remarks: row.remarks ?? null,
      }));

    if (entries.length === 0) {
      toast.error('Mark at least one student before saving.');
      return;
    }

    setSaving(true);
    try {
      const result = await api.post<{
        saved?: number;
        absentCount?: number;
        notificationsQueued?: number;
        notificationsSkipped?: number;
      }>('/api/admin/attendance', {
        classSectionId,
        date,
        period: 'DAY',
        entries,
      });

      const queued = result?.notificationsQueued ?? 0;
      toast.success(
        queued > 0
          ? `Register saved. ${queued} absence notification${queued === 1 ? '' : 's'} queued.`
          : 'Register saved.',
      );
      await loadRegister();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not save the register.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Mark the daily register for a class you teach."
      />

      {error && <Alert tone="danger" title="Could not load the register">{error}</Alert>}

      <Card>
        <CardHeader
          title="Register"
          description="Choose a class and date, then mark each student."
          icon={<ClipboardCheck />}
        />
        <div className="grid gap-4 p-4 sm:grid-cols-3 sm:p-5">
          <Field label="Class" htmlFor="att-class">
            <Select
              id="att-class"
              value={classSectionId}
              onChange={(event) => setClassSectionId(event.target.value)}
            >
              {classOptions.length === 0 && <option value="">No classes assigned</option>}
              {classOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" htmlFor="att-date">
            <Input
              id="att-date"
              type="date"
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={() => markAll('PRESENT')} disabled={rows.length === 0}>
              <CheckCircle2 />
              All present
            </Button>
            <Button variant="outline" onClick={() => markAll('ABSENT')} disabled={rows.length === 0}>
              <XCircle />
              All absent
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Students"
          description={
            rows.length > 0
              ? `${rows.filter((row) => row.status).length} of ${rows.length} marked`
              : 'No students to mark.'
          }
        />
        {loading ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="skeleton h-11 rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<ClipboardCheck />}
              title={loaded ? 'No students enrolled' : 'Choose a class'}
              description={
                loaded
                  ? 'This class has no active enrollments, so there is no register to mark.'
                  : 'Select one of your classes above to load its register.'
              }
            />
          </div>
        ) : (
          <>
            <TableWrap>
              <thead>
                <tr>
                  <Th>Student</Th>
                  <Th hideBelow="md">Admission no.</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Tr key={row.student.id}>
                    <Td>
                      <span className="text-sm font-medium text-[var(--ink)]">
                        {row.student.firstName} {row.student.lastName}
                      </span>
                    </Td>
                    <Td hideBelow="md">
                      <span className="tabular text-sm text-[var(--ink-muted)]">
                        {row.student.admissionNo}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {STATUS_OPTIONS.map((option) => {
                          const active = row.status === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setStatus(row.student.id, option.value)}
                              aria-pressed={active}
                              className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                                active
                                  ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-soft-ink)]'
                                  : 'border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--brand)]'
                              }`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--line)] p-4">
              <Button variant="ghost" onClick={() => void loadRegister()} loading={loading}>
                Reset
              </Button>
              <Button onClick={save} loading={saving}>
                <Save />
                Save register
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
