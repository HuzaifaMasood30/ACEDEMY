'use client';

import * as React from 'react';
import {
  Award,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react';
import { Alert, Badge, Button, Checkbox, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Card, CardHeader, EmptyState, PageHeader, StatCard, TableWrap, Td, Th, Tr } from '@/components/ui/structure';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Modal, ConfirmDialog } from '@/components/ui/overlays';
import { api } from '@/lib/client-api';
import { useMutation, useResource } from '@/lib/use-resource';
import { formatDate, formatNumber, titleCase } from '@/lib/format';

interface ExamRow {
  id: string;
  name: string;
  examType: string;
  status: string;
  resultStatus: string;
  startDate: string;
  endDate: string;
  publishedAt: string | null;
  academicSession: { name: string };
  _count: { subjects: number };
}

interface ExamDetail {
  id: string;
  name: string;
  examType: string;
  status: string;
  resultStatus: string;
  startDate: string;
  endDate: string;
  publishedAt: string | null;
  instructions: string | null;
  classSectionIds: string[];
  academicSession: { id: string; name: string };
  term: { id: string; name: string } | null;
  subjects: Array<{
    id: string;
    maxMarks: string;
    passMarks: string;
    examDate: string | null;
    subject: { id: string; name: string; code: string };
    classSection: { id: string; name: string };
    gradeScale: { id: string; name: string } | null;
    _count: { results: number };
  }>;
}

interface Options {
  sessions: Array<{ id: string; name: string; isCurrent: boolean }>;
  terms: Array<{ id: string; name: string; academicSessionId: string }>;
  classes: Array<{
    id: string;
    name: string;
    course: { name: string };
    _count: { enrollments: number };
  }>;
  subjects: Array<{ id: string; name: string; code: string }>;
  gradeScales: Array<{ id: string; name: true | boolean }>;
}

const EXAM_TYPES = [
  'QUIZ',
  'MONTHLY_TEST',
  'MIDTERM',
  'FINAL',
  'PRACTICAL',
  'MOCK_TEST',
  'ASSIGNMENT',
] as const;

const RESULT_TONE: Record<string, 'neutral' | 'warning' | 'info' | 'success'> = {
  DRAFT: 'neutral',
  SUBMITTED: 'warning',
  APPROVED: 'info',
  PUBLISHED: 'success',
};

export function ExamsClient() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [options, setOptions] = React.useState<Options | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<ExamRow | null>(null);

  const { run, pending } = useMutation();

  const resource = useResource<ExamRow>('/api/admin/exams', {
    params: { page, pageSize: 20, q: search, status },
    debounceMs: 250,
  });

  const loadOptions = React.useCallback(() => {
    api
      .getOne<Options>('/api/admin/exams/manage')
      .then(setOptions)
      .catch(() => undefined);
  }, []);

  React.useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const detail = useResource<ExamDetail>('/api/admin/exams/manage', {
    params: { examId: detailId ?? '' },
    enabled: Boolean(detailId),
  });

  const examDetail = (detail.rows as unknown as ExamDetail[])[0] ?? null;

  const columns: Column<ExamRow>[] = [
    {
      key: 'name',
      header: 'Examination',
      sortable: true,
      cell: (row) => (
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => setDetailId(row.id)}
            className="block truncate text-left text-sm font-medium text-[var(--ink)] hover:text-[var(--brand)]"
          >
            {row.name}
          </button>
          <span className="block text-[0.6875rem] text-[var(--ink-subtle)]">
            {titleCase(row.examType)} · {row.academicSession.name}
          </span>
        </div>
      ),
    },
    {
      key: 'period',
      header: 'Dates',
      hideBelow: 'md',
      cell: (row) => (
        <span className="tabular text-xs text-[var(--ink-muted)]">
          {formatDate(row.startDate)} — {formatDate(row.endDate)}
        </span>
      ),
    },
    {
      key: 'subjects',
      header: 'Subjects',
      align: 'right',
      cell: (row) => <span className="tabular text-sm">{row._count.subjects}</span>,
    },
    {
      key: 'status',
      header: 'Exam status',
      cell: (row) => (
        <Badge
          tone={
            row.status === 'COMPLETED' ? 'info' : row.status === 'CANCELLED' ? 'danger' : 'brand'
          }
        >
          {titleCase(row.status)}
        </Badge>
      ),
    },
    {
      key: 'resultStatus',
      header: 'Results',
      cell: (row) => (
        <div className="flex items-center gap-1.5">
          <Badge tone={RESULT_TONE[row.resultStatus] ?? 'neutral'}>
            {titleCase(row.resultStatus)}
          </Badge>
          {row.publishedAt && (
            <span className="text-[0.6875rem] text-[var(--ink-subtle)]">
              {formatDate(row.publishedAt)}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setDetailId(row.id)}>
            <ClipboardList />
            Manage
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={row.resultStatus !== 'DRAFT'}
            onClick={() => setDeleteTarget(row)}
          >
            <Trash2 />
          </Button>
        </div>
      ),
    },
  ];

  const published = resource.rows.filter((r) => r.resultStatus === 'PUBLISHED').length;
  const awaiting = resource.rows.filter(
    (r) => r.resultStatus === 'SUBMITTED' || r.resultStatus === 'APPROVED',
  ).length;

  const removeExam = async () => {
    if (!deleteTarget) return;
    const result = await run(
      () => api.put('/api/admin/exams/manage', { action: 'delete', examId: deleteTarget.id }),
      { success: 'Examination deleted.' },
    );
    if (result) {
      setDeleteTarget(null);
      resource.reload();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Examinations"
        description="Plan examinations, attach subjects and drive results from draft to published."
        breadcrumbs={[{ label: 'Academics' }, { label: 'Examinations' }]}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New examination
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Examinations"
          value={formatNumber(resource.meta?.total ?? 0)}
          icon={<CalendarClock />}
          tone="brand"
        />
        <StatCard
          label="Subjects scheduled"
          value={formatNumber(resource.rows.reduce((s, r) => s + r._count.subjects, 0))}
          icon={<ClipboardList />}
          tone="info"
        />
        <StatCard
          label="Awaiting publication"
          value={formatNumber(awaiting)}
          icon={<FileCheck2 />}
          tone={awaiting > 0 ? 'warning' : 'success'}
        />
        <StatCard label="Published" value={formatNumber(published)} icon={<Award />} tone="success" />
      </div>

      {resource.error && (
        <Alert tone="danger" title="Could not load examinations">
          {resource.error}
        </Alert>
      )}

      <DataTable<ExamRow>
        columns={columns}
        rows={resource.rows}
        rowKey={(row) => row.id}
        loading={resource.loading}
        searchable
        searchPlaceholder="Search examinations…"
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: [
              { value: 'DRAFT', label: 'Draft' },
              { value: 'SCHEDULED', label: 'Scheduled' },
              { value: 'ONGOING', label: 'Ongoing' },
              { value: 'COMPLETED', label: 'Completed' },
              { value: 'CANCELLED', label: 'Cancelled' },
            ],
          },
        ]}
        filterValues={{ status }}
        onFilterChange={(key, value) => {
          if (key === 'status') setStatus(value);
          setPage(1);
        }}
        pagination={
          resource.meta
            ? {
                page: resource.meta.page,
                pageSize: resource.meta.pageSize,
                total: resource.meta.total,
                totalPages: resource.meta.totalPages,
              }
            : undefined
        }
        onPageChange={setPage}
        emptyTitle="No examinations yet"
        emptyDescription="Create an examination, choose the classes it covers and attach the subjects."
        emptyAction={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New examination
          </Button>
        }
        toolbarExtra={
          <Button variant="outline" size="sm" onClick={resource.reload} loading={resource.refreshing}>
            <RefreshCw />
            Refresh
          </Button>
        }
      />

      <CreateExamModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        options={options}
        pending={pending}
        onSubmit={async (payload) => {
          const result = await run(() => api.post('/api/admin/exams/manage', payload), {
            success: 'Examination created.',
          });
          if (result) {
            setCreateOpen(false);
            resource.reload();
          }
        }}
      />

      <ExamDetailModal
        open={Boolean(detailId)}
        detail={examDetail}
        loading={detail.loading}
        options={options}
        pending={pending}
        run={run}
        onClose={() => setDetailId(null)}
        onChanged={() => {
          detail.reload();
          resource.reload();
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={removeExam}
        loading={pending}
        title="Delete this examination?"
        message={
          deleteTarget
            ? `${deleteTarget.name} and its ${deleteTarget._count.subjects} subject slot(s) will be removed. This is only possible while no marks have been entered.`
            : ''
        }
        confirmLabel="Delete"
      />
    </div>
  );
}

function CreateExamModal({
  open,
  onClose,
  options,
  pending,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  options: Options | null;
  pending: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = React.useState({
    name: '',
    examType: 'MIDTERM',
    academicSessionId: '',
    termId: '',
    startDate: '',
    endDate: '',
    maxMarks: '100',
    passMarks: '40',
    instructions: '',
    classSectionIds: [] as string[],
    subjectIds: [] as string[],
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open || !options) return;
    const current = options.sessions.find((s) => s.isCurrent) ?? options.sessions[0];
    if (current && !form.academicSessionId) {
      setForm((p) => ({ ...p, academicSessionId: current.id }));
    }
  }, [open, options, form.academicSessionId]);

  const terms = (options?.terms ?? []).filter(
    (term) => !form.academicSessionId || term.academicSessionId === form.academicSessionId,
  );

  const totalSlots = form.classSectionIds.length * form.subjectIds.length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New examination"
      description="Choose the classes first, then the subjects to examine in each."
      size="xl"
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            loading={pending}
            disabled={form.classSectionIds.length === 0}
            onClick={async () => {
              setErrors({});
              await onSubmit({
                action: 'create',
                name: form.name.trim(),
                examType: form.examType,
                academicSessionId: form.academicSessionId,
                termId: form.termId || null,
                startDate: form.startDate,
                endDate: form.endDate,
                classSectionIds: form.classSectionIds,
                subjectIds: form.subjectIds,
                maxMarks: Number(form.maxMarks || 100),
                passMarks: Number(form.passMarks || 40),
                instructions: form.instructions.trim() || null,
              });
            }}
          >
            Create examination
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Examination name" htmlFor="e-name" required error={errors.name}>
            <Input
              id="e-name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. First Term Examination"
            />
          </Field>

          <Field label="Type" htmlFor="e-type" required>
            <Select
              id="e-type"
              value={form.examType}
              onChange={(e) => setForm((p) => ({ ...p, examType: e.target.value }))}
            >
              {EXAM_TYPES.map((type) => (
                <option key={type} value={type}>
                  {titleCase(type)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Academic session" htmlFor="e-session" required>
            <Select
              id="e-session"
              value={form.academicSessionId}
              onChange={(e) =>
                setForm((p) => ({ ...p, academicSessionId: e.target.value, termId: '' }))
              }
            >
              <option value="">Choose a session…</option>
              {options?.sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                  {session.isCurrent ? ' (current)' : ''}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Term" htmlFor="e-term" hint="Optional.">
            <Select
              id="e-term"
              value={form.termId}
              onChange={(e) => setForm((p) => ({ ...p, termId: e.target.value }))}
            >
              <option value="">No specific term</option>
              {terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Start date" htmlFor="e-start" required error={errors.startDate}>
            <Input
              id="e-start"
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
            />
          </Field>

          <Field label="End date" htmlFor="e-end" required error={errors.endDate}>
            <Input
              id="e-end"
              type="date"
              value={form.endDate}
              min={form.startDate || undefined}
              onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
            />
          </Field>

          <Field label="Maximum marks" htmlFor="e-max" required hint="Default for every subject.">
            <Input
              id="e-max"
              type="number"
              min="1"
              value={form.maxMarks}
              onChange={(e) => setForm((p) => ({ ...p, maxMarks: e.target.value }))}
            />
          </Field>

          <Field label="Passing marks" htmlFor="e-pass" required>
            <Input
              id="e-pass"
              type="number"
              min="0"
              value={form.passMarks}
              onChange={(e) => setForm((p) => ({ ...p, passMarks: e.target.value }))}
            />
          </Field>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Classes" htmlFor="e-classes" required>
            <div
              id="e-classes"
              className="scrollbar-slim max-h-52 space-y-1 overflow-y-auto rounded-md border border-[var(--line-strong)] p-2.5"
            >
              {options?.classes.length ? (
                options.classes.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 rounded px-1.5 py-1 text-sm text-[var(--ink)] hover:bg-[var(--surface-hover)]"
                  >
                    <Checkbox
                      checked={form.classSectionIds.includes(c.id)}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          classSectionIds: e.target.checked
                            ? [...p.classSectionIds, c.id]
                            : p.classSectionIds.filter((id) => id !== c.id),
                        }))
                      }
                    />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="tabular text-xs text-[var(--ink-subtle)]">
                      {c._count.enrollments}
                    </span>
                  </label>
                ))
              ) : (
                <p className="p-2 text-xs text-[var(--ink-subtle)]">No active classes.</p>
              )}
            </div>
          </Field>

          <Field label="Subjects" htmlFor="e-subjects" hint="Optional — you can add them later.">
            <div
              id="e-subjects"
              className="scrollbar-slim max-h-52 space-y-1 overflow-y-auto rounded-md border border-[var(--line-strong)] p-2.5"
            >
              {options?.subjects.map((subject) => (
                <label
                  key={subject.id}
                  className="flex items-center gap-2 rounded px-1.5 py-1 text-sm text-[var(--ink)] hover:bg-[var(--surface-hover)]"
                >
                  <Checkbox
                    checked={form.subjectIds.includes(subject.id)}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        subjectIds: e.target.checked
                          ? [...p.subjectIds, subject.id]
                          : p.subjectIds.filter((id) => id !== subject.id),
                      }))
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">{subject.name}</span>
                  <span className="text-xs text-[var(--ink-subtle)]">{subject.code}</span>
                </label>
              ))}
            </div>
          </Field>
        </div>

        {totalSlots > 0 && (
          <Alert tone="info">
            This creates {totalSlots} subject slot{totalSlots === 1 ? '' : 's'} across{' '}
            {form.classSectionIds.length} class{form.classSectionIds.length === 1 ? '' : 'es'}.
            Marks can then be entered per class and subject.
          </Alert>
        )}

        <Field label="Instructions" htmlFor="e-instructions">
          <Textarea
            id="e-instructions"
            rows={2}
            value={form.instructions}
            onChange={(e) => setForm((p) => ({ ...p, instructions: e.target.value }))}
          />
        </Field>
      </div>
    </Modal>
  );
}

function ExamDetailModal({
  open,
  detail,
  loading,
  options,
  pending,
  run,
  onClose,
  onChanged,
}: {
  open: boolean;
  detail: ExamDetail | null;
  loading: boolean;
  options: Options | null;
  pending: boolean;
  run: ReturnType<typeof useMutation>['run'];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [addOpen, setAddOpen] = React.useState(false);
  const [addForm, setAddForm] = React.useState({
    subjectId: '',
    classSectionId: '',
    maxMarks: '100',
    passMarks: '40',
    examDate: '',
  });

  const workflow = async (action: 'submit' | 'approve' | 'publish') => {
    if (!detail) return;
    const result = await run(
      () =>
        api.put('/api/admin/exams', {
          action,
          examId: detail.id,
          ...(action === 'approve' ? { computeRanks: true } : {}),
        }),
      {
        success:
          action === 'submit'
            ? 'Submitted for approval.'
            : action === 'approve'
              ? 'Results approved.'
              : 'Results published to students and guardians.',
      },
    );
    if (result) onChanged();
  };

  const addSubject = async () => {
    if (!detail) return;
    const result = await run(
      () =>
        api.put('/api/admin/exams/manage', {
          action: 'addSubject',
          examId: detail.id,
          subjectId: addForm.subjectId,
          classSectionId: addForm.classSectionId,
          maxMarks: Number(addForm.maxMarks || 100),
          passMarks: Number(addForm.passMarks || 40),
          examDate: addForm.examDate || null,
        }),
      { success: 'Subject attached.' },
    );
    if (result) {
      setAddOpen(false);
      onChanged();
    }
  };

  const removeSubject = async (examSubjectId: string) => {
    const result = await run(
      () => api.put('/api/admin/exams/manage', { action: 'removeSubject', examSubjectId }),
      { success: 'Subject detached.' },
    );
    if (result) onChanged();
  };

  const grouped = React.useMemo(() => {
    if (!detail) return [];
    const map = new Map<string, ExamDetail['subjects']>();
    for (const slot of detail.subjects) {
      const list = map.get(slot.classSection.name) ?? [];
      list.push(slot);
      map.set(slot.classSection.name, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [detail]);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={detail ? detail.name : 'Loading…'}
        description={
          detail
            ? `${titleCase(detail.examType)} · ${detail.academicSession.name}${
                detail.term ? ` · ${detail.term.name}` : ''
              }`
            : undefined
        }
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="outline"
              onClick={() => setAddOpen(true)}
              disabled={!detail || detail.resultStatus !== 'DRAFT'}
            >
              <Plus />
              Attach subject
            </Button>
            {detail?.resultStatus === 'DRAFT' && (
              <Button onClick={() => workflow('submit')} loading={pending}>
                <Send />
                Submit for approval
              </Button>
            )}
            {detail?.resultStatus === 'SUBMITTED' && (
              <Button onClick={() => workflow('approve')} loading={pending}>
                <FileCheck2 />
                Approve results
              </Button>
            )}
            {detail?.resultStatus === 'APPROVED' && (
              <Button onClick={() => workflow('publish')} loading={pending}>
                <Award />
                Publish results
              </Button>
            )}
          </>
        }
      >
        {loading || !detail ? (
          <div className="py-10 text-center text-sm text-[var(--ink-muted)]">Loading…</div>
        ) : (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ['Dates', `${formatDate(detail.startDate)} — ${formatDate(detail.endDate)}`],
                ['Exam status', titleCase(detail.status)],
                ['Result status', titleCase(detail.resultStatus)],
                [
                  'Published',
                  detail.publishedAt ? formatDate(detail.publishedAt) : 'Not published',
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-[var(--ink-subtle)]">{label}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-[var(--ink)]">{value}</dd>
                </div>
              ))}
            </dl>

            {detail.resultStatus === 'PUBLISHED' && (
              <Alert tone="success" title="Results are live">
                Students and guardians can now see these results. Publishing also queues WhatsApp
                result notifications to verified guardians.
              </Alert>
            )}

            {detail.resultStatus === 'DRAFT' && (
              <Alert tone="info" title="Draft stage">
                Marks can still be edited and subjects attached. Submit for approval when marks entry
                is complete across every class.
              </Alert>
            )}

            {detail.instructions && (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-3.5">
                <p className="text-xs font-medium text-[var(--ink-muted)]">Instructions</p>
                <p className="mt-1 text-sm text-[var(--ink)]">{detail.instructions}</p>
              </div>
            )}

            {grouped.length === 0 ? (
              <EmptyState
                icon={<ClipboardList />}
                title="No subjects attached"
                description="Attach the subjects this examination covers so marks can be entered."
                className="border-0"
                action={
                  <Button onClick={() => setAddOpen(true)}>
                    <Plus />
                    Attach subject
                  </Button>
                }
              />
            ) : (
              grouped.map(([className, slots]) => (
                <Card key={className}>
                  <CardHeader
                    title={className}
                    description={`${slots.length} subject(s) · ${slots.reduce(
                      (s, slot) => s + slot._count.results,
                      0,
                    )} mark entries`}
                  />
                  <TableWrap>
                    <thead>
                      <tr>
                        <Th>Subject</Th>
                        <Th align="right">Maximum</Th>
                        <Th align="right">Pass</Th>
                        <Th>Exam date</Th>
                        <Th>Grading scale</Th>
                        <Th align="right">Entered</Th>
                        <Th align="right" />
                      </tr>
                    </thead>
                    <tbody>
                      {slots.map((slot) => (
                        <Tr key={slot.id}>
                          <Td>
                            <span className="text-sm text-[var(--ink)]">{slot.subject.name}</span>
                            <span className="ml-1.5 text-[0.6875rem] text-[var(--ink-subtle)]">
                              {slot.subject.code}
                            </span>
                          </Td>
                          <Td align="right" className="tabular text-sm">
                            {Number(slot.maxMarks)}
                          </Td>
                          <Td align="right" className="tabular text-sm">
                            {Number(slot.passMarks)}
                          </Td>
                          <Td className="tabular text-xs text-[var(--ink-muted)]">
                            {slot.examDate ? formatDate(slot.examDate) : 'Not set'}
                          </Td>
                          <Td className="text-xs text-[var(--ink-muted)]">
                            {slot.gradeScale?.name ?? 'Default scale'}
                          </Td>
                          <Td align="right" className="tabular text-sm">
                            {slot._count.results}
                          </Td>
                          <Td align="right">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={slot._count.results > 0}
                              onClick={() => removeSubject(slot.id)}
                            >
                              <Trash2 />
                            </Button>
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </TableWrap>
                </Card>
              ))
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Attach a subject"
        description="Adds one subject to one class within this examination."
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              onClick={addSubject}
              loading={pending}
              disabled={!addForm.subjectId || !addForm.classSectionId}
            >
              Attach
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Class" htmlFor="add-class" required>
            <Select
              id="add-class"
              value={addForm.classSectionId}
              onChange={(e) => setAddForm((p) => ({ ...p, classSectionId: e.target.value }))}
            >
              <option value="">Choose a class…</option>
              {options?.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Subject" htmlFor="add-subject" required>
            <Select
              id="add-subject"
              value={addForm.subjectId}
              onChange={(e) => setAddForm((p) => ({ ...p, subjectId: e.target.value }))}
            >
              <option value="">Choose a subject…</option>
              {options?.subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name} ({subject.code})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Maximum marks" htmlFor="add-max" required>
            <Input
              id="add-max"
              type="number"
              min="1"
              value={addForm.maxMarks}
              onChange={(e) => setAddForm((p) => ({ ...p, maxMarks: e.target.value }))}
            />
          </Field>

          <Field label="Passing marks" htmlFor="add-pass" required>
            <Input
              id="add-pass"
              type="number"
              min="0"
              value={addForm.passMarks}
              onChange={(e) => setAddForm((p) => ({ ...p, passMarks: e.target.value }))}
            />
          </Field>

          <Field label="Exam date" htmlFor="add-date" className="sm:col-span-2">
            <Input
              id="add-date"
              type="date"
              value={addForm.examDate}
              onChange={(e) => setAddForm((p) => ({ ...p, examDate: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}

export { CheckCircle2, Select };
