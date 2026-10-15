'use client';

import * as React from 'react';
import {
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Plus,
  RefreshCw,
  Sun,
  Trash2,
} from 'lucide-react';
import { Alert, Badge, Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Card, CardHeader, EmptyState, PageHeader, StatCard, TableWrap, Td, Th, Tr } from '@/components/ui/structure';
import { Modal, ConfirmDialog } from '@/components/ui/overlays';
import { api } from '@/lib/client-api';
import { useMutation, useResource } from '@/lib/use-resource';
import { formatDate, formatNumber } from '@/lib/format';

interface SessionRow {
  id: string;
  name: string;
  code: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  campusId: string | null;
  campus: { id: string; name: string } | null;
  _count: { terms: number; classSections: number; enrollments: number };
}

interface TermRow {
  id: string;
  name: string;
  sequence: number;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  academicSession: { id: string; name: string };
  _count: { exams: number; invoices: number };
}

interface HolidayRow {
  id: string;
  name: string;
  date: string;
  endDate: string | null;
  description: string | null;
  isRecurring: boolean;
  campusId: string | null;
}

interface SessionsPayload {
  sessions: SessionRow[];
  campuses: Array<{ id: string; name: string; code: string }>;
}

export function SessionsClient() {
  const [tab, setTab] = React.useState<'sessions' | 'terms' | 'holidays'>('sessions');
  const [sessionOpen, setSessionOpen] = React.useState(false);
  const [termOpen, setTermOpen] = React.useState(false);
  const [holidayOpen, setHolidayOpen] = React.useState(false);
  const [deleteHoliday, setDeleteHoliday] = React.useState<HolidayRow | null>(null);
  const [payload, setPayload] = React.useState<SessionsPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const { run, pending } = useMutation();

  const terms = useResource<TermRow>('/api/admin/sessions', {
    params: { scope: 'terms' },
    enabled: tab === 'terms',
  });

  const holidays = useResource<HolidayRow>('/api/admin/sessions', {
    params: { scope: 'holidays' },
    enabled: tab === 'holidays',
  });

  const termsRows = terms.rows as unknown as TermRow[];
  const holidayRows = holidays.rows as unknown as HolidayRow[];

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getOne<SessionsPayload>('/api/admin/sessions');
      setPayload(data);
      setError(null);
    } catch {
      setError('Could not load academic sessions.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const sessions = payload?.sessions ?? [];
  const campuses = payload?.campuses ?? [];
  const current = sessions.find((s) => s.isCurrent);
  const currentTerm = termsRows.find((t) => t.isCurrent);

  const setCurrentSession = async (sessionId: string) => {
    const result = await run(
      () => api.put('/api/admin/sessions', { action: 'setCurrentSession', sessionId }),
      { success: 'Current session updated.' },
    );
    if (result) await load();
  };

  const setCurrentTerm = async (termId: string) => {
    const result = await run(
      () => api.put('/api/admin/sessions', { action: 'setCurrentTerm', termId }),
      { success: 'Current term updated.' },
    );
    if (result) terms.reload();
  };

  const removeHoliday = async () => {
    if (!deleteHoliday) return;
    const result = await run(
      () => api.put('/api/admin/sessions', { action: 'deleteHoliday', holidayId: deleteHoliday.id }),
      { success: 'Holiday removed.' },
    );
    if (result) {
      setDeleteHoliday(null);
      holidays.reload();
    }
  };

  const upcomingHolidays = holidayRows.filter((h) => new Date(h.date) >= new Date()).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Academic sessions"
        description="Sessions, their terms and the academy holiday calendar."
        breadcrumbs={[{ label: 'Academics' }, { label: 'Sessions' }]}
        actions={
          <>
            <Button variant="outline" onClick={() => setHolidayOpen(true)}>
              <Sun />
              Add holiday
            </Button>
            <Button onClick={() => setSessionOpen(true)}>
              <Plus />
              New session
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sessions" value={formatNumber(sessions.length)} icon={<CalendarRange />} tone="brand" />
        <StatCard
          label="Current session"
          value={current?.name ?? 'Not set'}
          icon={<CheckCircle2 />}
          tone={current ? 'success' : 'danger'}
          hint={current ? `${current.code}` : 'Set one before enrolling students'}
        />
        <StatCard
          label="Terms"
          value={formatNumber(sessions.reduce((sum, s) => sum + s._count.terms, 0))}
          icon={<CalendarDays />}
          tone="info"
        />
        <StatCard
          label="Upcoming holidays"
          value={formatNumber(upcomingHolidays)}
          icon={<Sun />}
          tone="accent"
          hint={tab === 'holidays' ? 'From the holiday list' : 'Open the holidays tab'}
        />
      </div>

      {error && (
        <Alert tone="danger" title="Could not load sessions">
          {error}
        </Alert>
      )}

      {!current && !loading && sessions.length > 0 && (
        <Alert tone="warning" title="No session is marked current">
          Attendance, enrolment and fee generation all default to the current session. Mark one as
          current before continuing.
        </Alert>
      )}

      <div className="flex gap-1 border-b border-[var(--line)]">
        {(
          [
            ['sessions', 'Sessions'],
            ['terms', 'Terms'],
            ['holidays', 'Holidays'],
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

      {tab === 'sessions' && (
        <Card>
          <CardHeader
            title="Academic sessions"
            description="Only one session is current at a time."
            icon={<CalendarRange />}
            action={
              <Button variant="outline" size="sm" onClick={load} loading={loading}>
                <RefreshCw />
                Refresh
              </Button>
            }
          />

          {loading ? (
            <div className="py-12 text-center text-sm text-[var(--ink-muted)]">Loading…</div>
          ) : sessions.length === 0 ? (
            <EmptyState
              icon={<CalendarRange />}
              title="No sessions yet"
              description="Create an academic session so classes and enrolments can be dated."
              className="border-0"
              action={
                <Button onClick={() => setSessionOpen(true)}>
                  <Plus />
                  New session
                </Button>
              }
            />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Session</Th>
                  <Th>Period</Th>
                  <Th>Campus</Th>
                  <Th align="right">Terms</Th>
                  <Th align="right">Classes</Th>
                  <Th align="right">Enrolments</Th>
                  <Th align="right">Status</Th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <Tr key={session.id}>
                    <Td>
                      <span className="block text-sm font-medium text-[var(--ink)]">
                        {session.name}
                      </span>
                      <span className="tabular block text-[0.6875rem] text-[var(--ink-subtle)]">
                        {session.code}
                      </span>
                    </Td>
                    <Td className="tabular text-xs text-[var(--ink-muted)]">
                      {formatDate(session.startDate)} — {formatDate(session.endDate)}
                    </Td>
                    <Td className="text-xs text-[var(--ink-muted)]">
                      {session.campus?.name ?? 'All campuses'}
                    </Td>
                    <Td align="right" className="tabular text-sm">
                      {session._count.terms}
                    </Td>
                    <Td align="right" className="tabular text-sm">
                      {session._count.classSections}
                    </Td>
                    <Td align="right" className="tabular text-sm">
                      {session._count.enrollments}
                    </Td>
                    <Td align="right">
                      {session.isCurrent ? (
                        <Badge tone="success">
                          <CheckCircle2 className="size-3" />
                          Current
                        </Badge>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentSession(session.id)}
                          loading={pending}
                        >
                          Make current
                        </Button>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      )}

      {tab === 'terms' && (
        <Card>
          <CardHeader
            title="Terms"
            description="Break a session into terms for exams, invoices and reporting."
            icon={<CalendarDays />}
            action={
              <Button size="sm" variant="outline" onClick={() => setTermOpen(true)}>
                <Plus />
                Add term
              </Button>
            }
          />

          {terms.loading ? (
            <div className="py-12 text-center text-sm text-[var(--ink-muted)]">Loading…</div>
          ) : termsRows.length === 0 ? (
            <EmptyState
              icon={<CalendarDays />}
              title="No terms defined"
              description="Terms are optional, but they make term-wise reports and invoices possible."
              className="border-0"
            />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Term</Th>
                  <Th>Session</Th>
                  <Th>Period</Th>
                  <Th align="right">Exams</Th>
                  <Th align="right">Invoices</Th>
                  <Th align="right">Status</Th>
                </tr>
              </thead>
              <tbody>
                {termsRows.map((term) => (
                  <Tr key={term.id}>
                    <Td>
                      <span className="text-sm font-medium text-[var(--ink)]">{term.name}</span>
                      <span className="ml-2 text-[0.6875rem] text-[var(--ink-subtle)]">
                        #{term.sequence}
                      </span>
                    </Td>
                    <Td className="text-xs text-[var(--ink-muted)]">{term.academicSession.name}</Td>
                    <Td className="tabular text-xs text-[var(--ink-muted)]">
                      {formatDate(term.startDate)} — {formatDate(term.endDate)}
                    </Td>
                    <Td align="right" className="tabular text-sm">
                      {term._count.exams}
                    </Td>
                    <Td align="right" className="tabular text-sm">
                      {term._count.invoices}
                    </Td>
                    <Td align="right">
                      {term.isCurrent ? (
                        <Badge tone="success">Current</Badge>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentTerm(term.id)}
                          loading={pending}
                        >
                          Make current
                        </Button>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      )}

      {tab === 'holidays' && (
        <Card>
          <CardHeader
            title="Holiday calendar"
            description="Holidays block attendance marking and timetable generation."
            icon={<Sun />}
            action={
              <Button size="sm" variant="outline" onClick={() => setHolidayOpen(true)}>
                <Plus />
                Add holiday
              </Button>
            }
          />

          {holidays.loading ? (
            <div className="py-12 text-center text-sm text-[var(--ink-muted)]">Loading…</div>
          ) : holidayRows.length === 0 ? (
            <EmptyState
              icon={<Sun />}
              title="No holidays recorded"
              description="Add public holidays and academy closures so they are excluded from scheduling."
              className="border-0"
            />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Holiday</Th>
                  <Th>Date</Th>
                  <Th>Recurring</Th>
                  <Th>Description</Th>
                  <Th align="right" />
                </tr>
              </thead>
              <tbody>
                {holidayRows.map((holiday) => (
                  <Tr key={holiday.id}>
                    <Td>
                      <span className="text-sm font-medium text-[var(--ink)]">{holiday.name}</span>
                    </Td>
                    <Td className="tabular text-xs text-[var(--ink-muted)]">
                      {formatDate(holiday.date)}
                      {holiday.endDate ? ` — ${formatDate(holiday.endDate)}` : ''}
                    </Td>
                    <Td>
                      {holiday.isRecurring ? (
                        <Badge tone="brand">Yearly</Badge>
                      ) : (
                        <span className="text-xs text-[var(--ink-subtle)]">One-off</span>
                      )}
                    </Td>
                    <Td className="max-w-[18rem] truncate text-xs text-[var(--ink-muted)]">
                      {holiday.description ?? '—'}
                    </Td>
                    <Td align="right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteHoliday(holiday)}
                      >
                        <Trash2 />
                        Remove
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      )}

      <CreateSessionModal
        open={sessionOpen}
        onClose={() => setSessionOpen(false)}
        campuses={campuses}
        hasCurrent={Boolean(current)}
        pending={pending}
        onSubmit={async (payloadValue) => {
          const result = await run(() => api.post('/api/admin/sessions', payloadValue), {
            success: 'Session created.',
          });
          if (result) {
            setSessionOpen(false);
            await load();
          }
        }}
      />

      <CreateTermModal
        open={termOpen}
        onClose={() => setTermOpen(false)}
        sessions={sessions}
        pending={pending}
        onSubmit={async (payloadValue) => {
          const result = await run(() => api.post('/api/admin/sessions', payloadValue), {
            success: 'Term created.',
          });
          if (result) {
            setTermOpen(false);
            terms.reload();
          }
        }}
      />

      <CreateHolidayModal
        open={holidayOpen}
        onClose={() => setHolidayOpen(false)}
        pending={pending}
        onSubmit={async (payloadValue) => {
          const result = await run(() => api.post('/api/admin/sessions', payloadValue), {
            success: 'Holiday added.',
          });
          if (result) {
            setHolidayOpen(false);
            holidays.reload();
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteHoliday)}
        onClose={() => setDeleteHoliday(null)}
        onConfirm={removeHoliday}
        loading={pending}
        title="Remove this holiday?"
        message={deleteHoliday ? `${deleteHoliday.name} will no longer block scheduling.` : ''}
        confirmLabel="Remove"
      />

      {currentTerm && (
        <p className="text-xs text-[var(--ink-subtle)]">
          Current term: <span className="font-medium text-[var(--ink-muted)]">{currentTerm.name}</span>
        </p>
      )}
    </div>
  );
}

function CreateSessionModal({
  open,
  onClose,
  campuses,
  hasCurrent,
  pending,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  campuses: Array<{ id: string; name: string; code: string }>;
  hasCurrent: boolean;
  pending: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = React.useState({
    name: '',
    code: '',
    startDate: '',
    endDate: '',
    campusId: '',
    makeCurrent: false,
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (open && !hasCurrent) setForm((p) => ({ ...p, makeCurrent: true }));
  }, [open, hasCurrent]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New academic session"
      description="For example, 2027–2028 running from April to March."
      size="md"
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            loading={pending}
            onClick={async () => {
              setErrors({});
              await onSubmit({
                action: 'session',
                name: form.name.trim(),
                code: form.code.trim().toUpperCase(),
                startDate: form.startDate,
                endDate: form.endDate,
                campusId: form.campusId || null,
                makeCurrent: form.makeCurrent,
              });
            }}
          >
            Create session
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Session name" htmlFor="s-name" required error={errors.name}>
          <Input
            id="s-name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="2027–2028"
          />
        </Field>

        <Field
          label="Code"
          htmlFor="s-code"
          required
          hint="Short unique code, such as 2027-28."
          error={errors.code}
        >
          <Input
            id="s-code"
            value={form.code}
            onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
          />
        </Field>

        <Field label="Start date" htmlFor="s-start" required error={errors.startDate}>
          <Input
            id="s-start"
            type="date"
            value={form.startDate}
            onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
          />
        </Field>

        <Field label="End date" htmlFor="s-end" required error={errors.endDate}>
          <Input
            id="s-end"
            type="date"
            value={form.endDate}
            onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
          />
        </Field>

        <Field label="Campus" htmlFor="s-campus" hint="Leave blank to apply to all campuses.">
          <Select
            id="s-campus"
            value={form.campusId}
            onChange={(e) => setForm((p) => ({ ...p, campusId: e.target.value }))}
          >
            <option value="">All campuses</option>
            {campuses.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
            <input
              type="checkbox"
              checked={form.makeCurrent}
              onChange={(e) => setForm((p) => ({ ...p, makeCurrent: e.target.checked }))}
              className="size-4 accent-[var(--brand)]"
            />
            Make this the current session
          </label>
        </div>
      </div>
    </Modal>
  );
}

function CreateTermModal({
  open,
  onClose,
  sessions,
  pending,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  sessions: SessionRow[];
  pending: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = React.useState({
    academicSessionId: '',
    name: '',
    sequence: '1',
    startDate: '',
    endDate: '',
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    const current = sessions.find((s) => s.isCurrent) ?? sessions[0];
    if (open && current && !form.academicSessionId) {
      setForm((p) => ({ ...p, academicSessionId: current.id }));
    }
  }, [open, sessions, form.academicSessionId]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a term"
      size="md"
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            loading={pending}
            onClick={async () => {
              setErrors({});
              await onSubmit({
                action: 'term',
                academicSessionId: form.academicSessionId,
                name: form.name.trim(),
                sequence: Number(form.sequence || 1),
                startDate: form.startDate,
                endDate: form.endDate,
              });
            }}
          >
            Create term
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Academic session" htmlFor="t-session" required className="sm:col-span-2">
          <Select
            id="t-session"
            value={form.academicSessionId}
            onChange={(e) => setForm((p) => ({ ...p, academicSessionId: e.target.value }))}
          >
            <option value="">Choose a session…</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Term name" htmlFor="t-name" required error={errors.name}>
          <Input
            id="t-name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Term 1"
          />
        </Field>

        <Field label="Sequence" htmlFor="t-sequence" required hint="Order within the session.">
          <Input
            id="t-sequence"
            type="number"
            min="1"
            max="12"
            value={form.sequence}
            onChange={(e) => setForm((p) => ({ ...p, sequence: e.target.value }))}
          />
        </Field>

        <Field label="Start date" htmlFor="t-start" required>
          <Input
            id="t-start"
            type="date"
            value={form.startDate}
            onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
          />
        </Field>

        <Field label="End date" htmlFor="t-end" required>
          <Input
            id="t-end"
            type="date"
            value={form.endDate}
            onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
          />
        </Field>
      </div>
    </Modal>
  );
}

function CreateHolidayModal({
  open,
  onClose,
  pending,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  pending: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = React.useState({
    name: '',
    date: '',
    endDate: '',
    description: '',
    isRecurring: false,
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a holiday"
      size="md"
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            loading={pending}
            onClick={async () => {
              setErrors({});
              await onSubmit({
                action: 'holiday',
                name: form.name.trim(),
                date: form.date,
                endDate: form.endDate || null,
                description: form.description.trim() || null,
                isRecurring: form.isRecurring,
              });
            }}
          >
            Add holiday
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Holiday name" htmlFor="h-name" required error={errors.name}>
          <Input
            id="h-name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Independence Day"
          />
        </Field>

        <Field label="Date" htmlFor="h-date" required error={errors.date}>
          <Input
            id="h-date"
            type="date"
            value={form.date}
            onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
          />
        </Field>

        <Field
          label="End date"
          htmlFor="h-end"
          hint="Leave blank for a single-day holiday."
        >
          <Input
            id="h-end"
            type="date"
            value={form.endDate}
            onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
          />
        </Field>

        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
            <input
              type="checkbox"
              checked={form.isRecurring}
              onChange={(e) => setForm((p) => ({ ...p, isRecurring: e.target.checked }))}
              className="size-4 accent-[var(--brand)]"
            />
            Repeats every year
          </label>
        </div>

        <Field label="Description" htmlFor="h-description" className="sm:col-span-2">
          <Textarea
            id="h-description"
            rows={2}
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          />
        </Field>
      </div>
    </Modal>
  );
}
