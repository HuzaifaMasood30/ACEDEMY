'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  BookOpen,
  GraduationCap,
  Layers,
  Plus,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { Alert, Badge, Button, Checkbox, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { PageHeader, StatCard } from '@/components/ui/structure';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Modal } from '@/components/ui/overlays';
import { api, ApiError } from '@/lib/client-api';
import { useMutation, useResource } from '@/lib/use-resource';
import { formatMoney, formatNumber, titleCase } from '@/lib/format';

interface CourseRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  durationWeeks: number | null;
  baseFee: string;
  feeFrequency: string;
  prerequisites: string | null;
  certificateEligible: boolean;
  isActive: boolean;
  _count: { classSections: number; courseSubjects: number; feeStructures: number };
}

const FREQUENCIES = ['MONTHLY', 'QUARTERLY', 'TERM', 'ANNUAL', 'ONE_TIME'];

const blank = {
  code: '',
  name: '',
  description: '',
  durationWeeks: '',
  baseFee: '0',
  feeFrequency: 'MONTHLY',
  prerequisites: '',
  certificateEligible: false,
  isActive: true,
};

export function CoursesClient() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [includeInactive, setIncludeInactive] = React.useState(false);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CourseRow | null>(null);
  const [form, setForm] = React.useState({ ...blank });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [currency, setCurrency] = React.useState('PKR');

  const { run, pending } = useMutation();

  const resource = useResource<CourseRow>('/api/admin/courses', {
    params: { page, pageSize: 20, q: search, includeInactive: includeInactive ? 'true' : '' },
    debounceMs: 250,
  });

  React.useEffect(() => {
    api
      .getOne<{ academy: { currency: string } }>('/api/admin/settings')
      .then((data) => setCurrency(data.academy.currency))
      .catch(() => undefined);
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...blank });
    setErrors({});
    setEditorOpen(true);
  };

  const openEdit = (row: CourseRow) => {
    setEditing(row);
    setForm({
      code: row.code,
      name: row.name,
      description: row.description ?? '',
      durationWeeks: row.durationWeeks?.toString() ?? '',
      baseFee: row.baseFee,
      feeFrequency: row.feeFrequency,
      prerequisites: row.prerequisites ?? '',
      certificateEligible: row.certificateEligible,
      isActive: row.isActive,
    });
    setErrors({});
    setEditorOpen(true);
  };

  const submit = async () => {
    setErrors({});

    const payload = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      durationWeeks: form.durationWeeks ? Number(form.durationWeeks) : null,
      baseFee: Number(form.baseFee || 0),
      feeFrequency: form.feeFrequency,
      prerequisites: form.prerequisites.trim() || null,
      certificateEligible: form.certificateEligible,
      isActive: form.isActive,
    };

    try {
      const result = editing
        ? await run(() => api.put('/api/admin/courses', { id: editing.id, ...payload }), {
            success: 'Course updated.',
          })
        : await run(() => api.post('/api/admin/courses', payload), { success: 'Course created.' });

      if (result) {
        setEditorOpen(false);
        resource.reload();
      }
    } catch (caught) {
      if (caught instanceof ApiError) setErrors(caught.fieldErrors);
    }
  };

  const columns: Column<CourseRow>[] = [
    {
      key: 'name',
      header: 'Course',
      sortable: true,
      cell: (row) => (
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => openEdit(row)}
            className="block truncate text-left text-sm font-medium text-[var(--ink)] hover:text-[var(--brand)]"
          >
            {row.name}
          </button>
          <span className="block text-[0.6875rem] text-[var(--ink-subtle)]">{row.code}</span>
        </div>
      ),
    },
    {
      key: 'baseFee',
      header: 'Fee',
      align: 'right',
      sortable: true,
      cell: (row) => (
        <div className="text-right">
          <span className="tabular block text-sm text-[var(--ink)]">
            {formatMoney(Number(row.baseFee), currency)}
          </span>
          <span className="block text-[0.6875rem] text-[var(--ink-subtle)]">
            {titleCase(row.feeFrequency)}
          </span>
        </div>
      ),
    },
    {
      key: 'duration',
      header: 'Duration',
      align: 'right',
      hideBelow: 'md',
      cell: (row) => (
        <span className="tabular text-xs text-[var(--ink-muted)]">
          {row.durationWeeks ? `${row.durationWeeks} weeks` : 'Open-ended'}
        </span>
      ),
    },
    {
      key: 'classes',
      header: 'Classes',
      align: 'right',
      hideBelow: 'sm',
      cell: (row) => <span className="tabular text-sm">{formatNumber(row._count.classSections)}</span>,
    },
    {
      key: 'subjects',
      header: 'Subjects',
      align: 'right',
      hideBelow: 'sm',
      cell: (row) => <span className="tabular text-sm">{formatNumber(row._count.courseSubjects)}</span>,
    },
    {
      key: 'flags',
      header: 'Flags',
      hideBelow: 'lg',
      cell: (row) => (
        <div className="flex flex-wrap gap-1.5">
          {row.certificateEligible && <Badge tone="brand">Certificate</Badge>}
          {!row.isActive && <Badge tone="warning">Inactive</Badge>}
          {row.isActive && row.certificateEligible === false && (
            <span className="text-xs text-[var(--ink-subtle)]">—</span>
          )}
        </div>
      ),
    },
  ];

  const totalCourses = resource.meta?.total ?? 0;
  const certificateCount = resource.rows.filter((r) => r.certificateEligible).length;
  const classCount = resource.rows.reduce((sum, r) => sum + r._count.classSections, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Courses and programmes"
        description="Define what the academy teaches, how long it runs and what it costs."
        breadcrumbs={[{ label: 'Academics' }, { label: 'Courses' }]}
        actions={
          <Button onClick={openCreate}>
            <Plus />
            New course
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Courses" value={formatNumber(totalCourses)} icon={<BookOpen />} tone="brand" />
        <StatCard
          label="Classes on this page"
          value={formatNumber(classCount)}
          icon={<Layers />}
          tone="info"
        />
        <StatCard
          label="Certificate eligible"
          value={formatNumber(certificateCount)}
          icon={<GraduationCap />}
          tone="success"
        />
        <StatCard
          label="Fee currency"
          value={currency}
          icon={<Wallet />}
          tone="accent"
          hint="Change this in Settings"
        />
      </div>

      {resource.error && (
        <Alert tone="danger" title="Could not load courses">
          {resource.error}
        </Alert>
      )}

      <DataTable<CourseRow>
        columns={columns}
        rows={resource.rows}
        rowKey={(row) => row.id}
        loading={resource.loading}
        searchable
        searchPlaceholder="Search by course name or code…"
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
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
        emptyTitle="No courses yet"
        emptyDescription="Create the first course so classes and subjects can be attached to it."
        emptyAction={
          <Button onClick={openCreate}>
            <Plus />
            New course
          </Button>
        }
        toolbarExtra={
          <>
            <label className="flex items-center gap-2 text-xs text-[var(--ink-muted)]">
              <Checkbox
                checked={includeInactive}
                onChange={(e) => {
                  setIncludeInactive(e.target.checked);
                  setPage(1);
                }}
              />
              Show inactive
            </label>
            <Button variant="outline" size="sm" onClick={resource.reload} loading={resource.refreshing}>
              <RefreshCw />
              Refresh
            </Button>
          </>
        }
      />

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'New course'}
        description="Fees entered here become the default when a fee structure is generated."
        size="lg"
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending}>
              {editing ? 'Save changes' : 'Create course'}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Course name" htmlFor="course-name" required error={errors.name}>
            <Input
              id="course-name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Grade 9 Science"
            />
          </Field>

          <Field
            label="Code"
            htmlFor="course-code"
            required
            hint="Short unique code, letters and numbers."
            error={errors.code}
          >
            <Input
              id="course-code"
              value={form.code}
              onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
              placeholder="G9-SCI"
            />
          </Field>

          <Field label="Base fee" htmlFor="course-fee" error={errors.baseFee}>
            <Input
              id="course-fee"
              type="number"
              min="0"
              step="0.01"
              value={form.baseFee}
              onChange={(e) => setForm((p) => ({ ...p, baseFee: e.target.value }))}
            />
          </Field>

          <Field label="Fee frequency" htmlFor="course-frequency">
            <Select
              id="course-frequency"
              value={form.feeFrequency}
              onChange={(e) => setForm((p) => ({ ...p, feeFrequency: e.target.value }))}
            >
              {FREQUENCIES.map((value) => (
                <option key={value} value={value}>
                  {titleCase(value)}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Duration in weeks"
            htmlFor="course-duration"
            hint="Leave blank for an open-ended programme."
          >
            <Input
              id="course-duration"
              type="number"
              min="1"
              value={form.durationWeeks}
              onChange={(e) => setForm((p) => ({ ...p, durationWeeks: e.target.value }))}
            />
          </Field>

          <div className="flex items-end gap-5 pb-1">
            <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
              <Checkbox
                checked={form.certificateEligible}
                onChange={(e) =>
                  setForm((p) => ({ ...p, certificateEligible: e.target.checked }))
                }
              />
              Certificate on completion
            </label>

            <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
              <Checkbox
                checked={form.isActive}
                onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
              />
              Active
            </label>
          </div>

          <Field label="Prerequisites" htmlFor="course-prereq" className="sm:col-span-2">
            <Input
              id="course-prereq"
              value={form.prerequisites}
              onChange={(e) => setForm((p) => ({ ...p, prerequisites: e.target.value }))}
              placeholder="e.g. Grade 8 completed, or a placement test"
            />
          </Field>

          <Field label="Description" htmlFor="course-description" className="sm:col-span-2">
            <Textarea
              id="course-description"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

export { Link };
