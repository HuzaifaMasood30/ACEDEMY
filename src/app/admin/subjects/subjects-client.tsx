'use client';

import * as React from 'react';
import { BookMarked, Library, Link2, Plus, RefreshCw, Users } from 'lucide-react';
import { Alert, Badge, Button, Checkbox, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Card, CardHeader, EmptyState, PageHeader, StatCard } from '@/components/ui/structure';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Modal } from '@/components/ui/overlays';
import { api } from '@/lib/client-api';
import { useMutation, useResource } from '@/lib/use-resource';
import { formatNumber } from '@/lib/format';

interface SubjectRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  credits: number;
  isActive: boolean;
  courseSubjects: Array<{ courseId: string; isOptional: boolean }>;
  _count: {
    teacherSubjects: number;
    classSubjects: number;
    courseSubjects: number;
    assignments: number;
  };
}

interface CourseOption {
  id: string;
  name: string;
  code: string;
}

const blank = { code: '', name: '', description: '', credits: '0', isActive: true };

export function SubjectsClient() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [includeInactive, setIncludeInactive] = React.useState(false);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkTarget, setLinkTarget] = React.useState<SubjectRow | null>(null);
  const [editing, setEditing] = React.useState<SubjectRow | null>(null);
  const [form, setForm] = React.useState({ ...blank });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [courses, setCourses] = React.useState<CourseOption[]>([]);
  const [linkedCourseIds, setLinkedCourseIds] = React.useState<string[]>([]);

  const { run, pending } = useMutation();

  const resource = useResource<SubjectRow>('/api/admin/subjects', {
    params: { page, pageSize: 20, q: search, includeInactive: includeInactive ? 'true' : '' },
    debounceMs: 250,
  });

  React.useEffect(() => {
    api
      .getOne<{ rows: CourseOption[] }>('/api/admin/courses', { pageSize: 200 })
      .then((data) => setCourses(data.rows ?? []))
      .catch(() => undefined);
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...blank });
    setErrors({});
    setEditorOpen(true);
  };

  const openEdit = (row: SubjectRow) => {
    setEditing(row);
    setForm({
      code: row.code,
      name: row.name,
      description: row.description ?? '',
      credits: String(row.credits),
      isActive: row.isActive,
    });
    setErrors({});
    setEditorOpen(true);
  };

  const openLink = (row: SubjectRow) => {
    setLinkTarget(row);
    // Link state comes from the row itself, so the modal opens already correct.
    setLinkedCourseIds(row.courseSubjects.map((link) => link.courseId));
    setLinkOpen(true);
  };

  const submit = async () => {
    setErrors({});
    const payload = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      credits: Number(form.credits || 0),
      isActive: form.isActive,
    };

    try {
      const result = editing
        ? await run(
            () =>
              api.put('/api/admin/subjects', {
                action: 'update',
                id: editing.id,
                values: {
                  name: payload.name,
                  description: payload.description,
                  credits: payload.credits,
                  isActive: payload.isActive,
                },
              }),
            { success: 'Subject updated.' },
          )
        : await run(() => api.post('/api/admin/subjects', payload), {
            success: 'Subject created.',
          });

      if (result) {
        setEditorOpen(false);
        resource.reload();
      }
    } catch (caught) {
      setErrors({});
    }
  };

  const toggleCourseLink = async (courseId: string, linked: boolean) => {
    if (!linkTarget) return;

    const result = await run(
      () =>
        api.put('/api/admin/subjects', {
          action: linked ? 'linkCourse' : 'unlinkCourse',
          subjectId: linkTarget.id,
          courseId,
        }),
      { success: linked ? 'Linked to course.' : 'Unlinked from course.' },
    );

    if (result) {
      setLinkedCourseIds((prev) =>
        linked ? [...prev, courseId] : prev.filter((id) => id !== courseId),
      );
      resource.reload();
    }
  };

  const columns: Column<SubjectRow>[] = [
    {
      key: 'name',
      header: 'Subject',
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
      key: 'credits',
      header: 'Credits',
      align: 'right',
      hideBelow: 'md',
      cell: (row) => <span className="tabular text-sm">{row.credits}</span>,
    },
    {
      key: 'teachers',
      header: 'Teachers',
      align: 'right',
      hideBelow: 'sm',
      cell: (row) => (
        <span className="tabular text-sm">{formatNumber(row._count.teacherSubjects)}</span>
      ),
    },
    {
      key: 'classes',
      header: 'Classes',
      align: 'right',
      hideBelow: 'sm',
      cell: (row) => (
        <span className="tabular text-sm">{formatNumber(row._count.classSubjects)}</span>
      ),
    },
    {
      key: 'courses',
      header: 'Courses',
      align: 'right',
      hideBelow: 'lg',
      cell: (row) => (
        <span className="tabular text-sm">{formatNumber(row._count.courseSubjects)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <Badge tone={row.isActive ? 'success' : 'warning'}>
          {row.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <Button variant="ghost" size="sm" onClick={() => openLink(row)}>
          <Link2 />
          Courses
        </Button>
      ),
    },
  ];

  const totalTeachers = resource.rows.reduce((sum, r) => sum + r._count.teacherSubjects, 0);
  const totalClasses = resource.rows.reduce((sum, r) => sum + r._count.classSubjects, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subjects"
        description="The teaching units that make up courses and classes."
        breadcrumbs={[{ label: 'Academics' }, { label: 'Subjects' }]}
        actions={
          <Button onClick={openCreate}>
            <Plus />
            New subject
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Subjects" value={formatNumber(resource.meta?.total ?? 0)} icon={<Library />} tone="brand" />
        <StatCard
          label="Teacher assignments"
          value={formatNumber(totalTeachers)}
          icon={<Users />}
          tone="info"
          hint="Across the subjects on this page"
        />
        <StatCard label="Class assignments" value={formatNumber(totalClasses)} icon={<BookMarked />} tone="accent" />
        <StatCard label="Courses" value={formatNumber(courses.length)} icon={<Link2 />} tone="success" />
      </div>

      {resource.error && (
        <Alert tone="danger" title="Could not load subjects">
          {resource.error}
        </Alert>
      )}

      <DataTable<SubjectRow>
        columns={columns}
        rows={resource.rows}
        rowKey={(row) => row.id}
        loading={resource.loading}
        searchable
        searchPlaceholder="Search by subject name or code…"
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
        emptyTitle="No subjects yet"
        emptyDescription="Add the subjects your academy teaches, then attach them to courses and classes."
        emptyAction={
          <Button onClick={openCreate}>
            <Plus />
            New subject
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
        title={editing ? `Edit ${editing.name}` : 'New subject'}
        size="md"
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending}>
              {editing ? 'Save changes' : 'Create subject'}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Subject name" htmlFor="subject-name" required>
            <Input
              id="subject-name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Mathematics"
            />
          </Field>

          <Field
            label="Code"
            htmlFor="subject-code"
            required
            hint={editing ? 'Codes cannot be changed after creation.' : undefined}
          >
            <Input
              id="subject-code"
              value={form.code}
              disabled={Boolean(editing)}
              onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
              placeholder="MATH"
            />
          </Field>

          <Field label="Credits" htmlFor="subject-credits">
            <Input
              id="subject-credits"
              type="number"
              min="0"
              max="20"
              value={form.credits}
              onChange={(e) => setForm((p) => ({ ...p, credits: e.target.value }))}
            />
          </Field>

          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
              <Checkbox
                checked={form.isActive}
                onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
              />
              Active
            </label>
          </div>

          <Field label="Description" htmlFor="subject-description" className="sm:col-span-2">
            <Textarea
              id="subject-description"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        title={`Courses using ${linkTarget?.name ?? ''}`}
        description="Tick a course to include this subject in it."
        size="md"
        footer={
          <Button variant="outline" onClick={() => setLinkOpen(false)}>
            Done
          </Button>
        }
      >
        {courses.length === 0 ? (
          <EmptyState
            icon={<Library />}
            title="No courses yet"
            description="Create a course first, then attach subjects to it."
            className="border-0"
          />
        ) : (
          <Card>
            <CardHeader
              title="Course links"
              description="Changes apply immediately."
              icon={<Link2 />}
            />
            <ul className="divide-y divide-[var(--line)]">
              {courses.map((course) => {
                const linked = linkedCourseIds.includes(course.id);
                return (
                  <li key={course.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-[var(--ink)]">{course.name}</p>
                      <p className="text-[0.6875rem] text-[var(--ink-subtle)]">{course.code}</p>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-[var(--ink-muted)]">
                      <Checkbox
                        checked={linked}
                        onChange={(e) => toggleCourseLink(course.id, e.target.checked)}
                      />
                      {linked ? 'Linked' : 'Not linked'}
                    </label>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </Modal>
    </div>
  );
}

export { Select };
