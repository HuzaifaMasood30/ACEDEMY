'use client';

import * as React from 'react';
import {
  BookOpen,
  Layers,
  Plus,
  RefreshCw,
  School,
  UserCog,
  Users,
} from 'lucide-react';
import { Alert, Badge, Button, Checkbox, Field, Input, Select } from '@/components/ui/primitives';
import { Card, CardHeader, EmptyState, PageHeader, StatCard, TableWrap, Td, Th, Tr } from '@/components/ui/structure';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Modal } from '@/components/ui/overlays';
import { api } from '@/lib/client-api';
import { useMutation, useResource } from '@/lib/use-resource';
import { formatDate, formatNumber, titleCase } from '@/lib/format';

interface ClassRow {
  id: string;
  name: string;
  capacity: number;
  isActive: boolean;
  course: { id: string; name: string; code: string };
  academicSession: { id: string; name: string };
  classTeacher: { user: { name: string } } | null;
  _count: { enrollments: number; classSubjects: number; batches: number };
}

interface ClassDetail {
  id: string;
  name: string;
  capacity: number;
  isActive: boolean;
  course: { id: string; name: string; code: string };
  academicSession: { id: string; name: string };
  classTeacher: { id: string; user: { name: string } } | null;
  classSubjects: Array<{ id: string; subject: { id: string; name: string; code: string } }>;
  batches: Array<{ id: string; name: string; capacity: number }>;
  enrollments: Array<{
    id: string;
    rollNo: string | null;
    enrolledAt: string;
    student: {
      id: string;
      admissionNo: string;
      firstName: string;
      lastName: string;
      status: string;
    };
  }>;
}

interface OptionRow {
  id: string;
  name: string;
}

export function ClassesClient() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [courseId, setCourseId] = React.useState('');
  const [includeInactive, setIncludeInactive] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [detailId, setDetailId] = React.useState<string | null>(null);

  const [courses, setCourses] = React.useState<Array<OptionRow & { code: string }>>([]);
  const [sessions, setSessions] = React.useState<
    Array<OptionRow & { code: string; isCurrent: boolean }>
  >([]);
  const [teachers, setTeachers] = React.useState<
    Array<{ id: string; user: { name: string }; employeeCode: string }>
  >([]);

  const { run, pending } = useMutation();

  const resource = useResource<ClassRow>('/api/admin/classes', {
    params: {
      page,
      pageSize: 20,
      q: search,
      courseId,
      includeInactive: includeInactive ? 'true' : '',
    },
    debounceMs: 250,
  });

  const detail = useResource<ClassDetail>('/api/admin/classes', {
    params: { scope: 'detail', id: detailId ?? '' },
    enabled: Boolean(detailId),
  });

  const classDetail = (detail.rows as unknown as ClassDetail[])[0] ?? null;

  React.useEffect(() => {
    Promise.all([
      api.getOne<{ rows: Array<OptionRow & { code: string }> }>('/api/admin/courses', {
        pageSize: 200,
      }),
      api.getOne<{ sessions: Array<OptionRow & { code: string; isCurrent: boolean }> }>(
        '/api/admin/sessions',
      ),
      api.getOne<{ rows: Array<{ id: string; user: { name: string }; employeeCode: string }> }>(
        '/api/admin/teachers',
        { pageSize: 200 },
      ),
    ])
      .then(([courseData, sessionData, teacherData]) => {
        setCourses(courseData.rows ?? []);
        setSessions(sessionData.sessions ?? []);
        setTeachers(teacherData.rows ?? []);
      })
      .catch(() => undefined);
  }, []);

  const columns: Column<ClassRow>[] = [
    {
      key: 'name',
      header: 'Class',
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
            {row.course.name} · {row.academicSession.name}
          </span>
        </div>
      ),
    },
    {
      key: 'teacher',
      header: 'Class teacher',
      hideBelow: 'md',
      cell: (row) =>
        row.classTeacher ? (
          <span className="text-sm text-[var(--ink)]">{row.classTeacher.user.name}</span>
        ) : (
          <span className="text-xs text-[var(--ink-subtle)]">Unassigned</span>
        ),
    },
    {
      key: 'enrolled',
      header: 'Enrolled',
      align: 'right',
      cell: (row) => (
        <div className="text-right">
          <span className="tabular block text-sm">
            {row._count.enrollments}/{row.capacity}
          </span>
          <span className="block text-[0.6875rem] text-[var(--ink-subtle)]">
            {row.capacity > 0
              ? `${Math.round((row._count.enrollments / row.capacity) * 100)}% full`
              : '—'}
          </span>
        </div>
      ),
    },
    {
      key: 'subjects',
      header: 'Subjects',
      align: 'right',
      hideBelow: 'sm',
      cell: (row) => <span className="tabular text-sm">{formatNumber(row._count.classSubjects)}</span>,
    },
    {
      key: 'batches',
      header: 'Batches',
      align: 'right',
      hideBelow: 'lg',
      cell: (row) => <span className="tabular text-sm">{formatNumber(row._count.batches)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <Badge
          tone={
            !row.isActive
              ? 'warning'
              : row._count.enrollments >= row.capacity
                ? 'danger'
                : 'success'
          }
        >
          {!row.isActive ? 'Inactive' : row._count.enrollments >= row.capacity ? 'Full' : 'Open'}
        </Badge>
      ),
    },
  ];

  const totalEnrolled = resource.rows.reduce((sum, r) => sum + r._count.enrollments, 0);
  const totalCapacity = resource.rows.reduce((sum, r) => sum + r.capacity, 0);
  const fullClasses = resource.rows.filter((r) => r._count.enrollments >= r.capacity).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Classes and sections"
        description="Teaching groups, their capacity, subjects and class teachers."
        breadcrumbs={[{ label: 'Academics' }, { label: 'Classes' }]}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New class
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Classes" value={formatNumber(resource.meta?.total ?? 0)} icon={<School />} tone="brand" />
        <StatCard
          label="Seats filled"
          value={`${formatNumber(totalEnrolled)} / ${formatNumber(totalCapacity)}`}
          icon={<Users />}
          tone="info"
          hint="Across the classes on this page"
        />
        <StatCard
          label="Full classes"
          value={formatNumber(fullClasses)}
          icon={<Layers />}
          tone={fullClasses > 0 ? 'warning' : 'success'}
        />
        <StatCard label="Courses" value={formatNumber(courses.length)} icon={<BookOpen />} tone="accent" />
      </div>

      {resource.error && (
        <Alert tone="danger" title="Could not load classes">
          {resource.error}
        </Alert>
      )}

      <DataTable<ClassRow>
        columns={columns}
        rows={resource.rows}
        rowKey={(row) => row.id}
        loading={resource.loading}
        searchable
        searchPlaceholder="Search by class or course name…"
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        filters={[
          {
            key: 'courseId',
            label: 'Course',
            options: courses.map((c) => ({ value: c.id, label: c.name })),
          },
        ]}
        filterValues={{ courseId }}
        onFilterChange={(key, value) => {
          if (key === 'courseId') setCourseId(value);
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
        emptyTitle="No classes yet"
        emptyDescription="Create a class to enrol students and build a timetable."
        emptyAction={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New class
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

      <CreateClassModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        courses={courses}
        sessions={sessions}
        teachers={teachers}
        pending={pending}
        onSubmit={async (payload) => {
          const result = await run(() => api.post('/api/admin/classes', payload), {
            success: 'Class created.',
          });
          if (result) {
            setCreateOpen(false);
            resource.reload();
          }
        }}
      />

      <ClassDetailModal
        open={Boolean(detailId)}
        detail={classDetail}
        loading={detail.loading}
        onClose={() => setDetailId(null)}
        teachers={teachers}
        pending={pending}
        run={run}
        onChanged={() => {
          detail.reload();
          resource.reload();
        }}
      />
    </div>
  );
}

function CreateClassModal({
  open,
  onClose,
  courses,
  sessions,
  teachers,
  pending,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  courses: Array<OptionRow & { code: string }>;
  sessions: Array<OptionRow & { code: string; isCurrent: boolean }>;
  teachers: Array<{ id: string; user: { name: string }; employeeCode: string }>;
  pending: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = React.useState({
    name: '',
    courseId: '',
    academicSessionId: '',
    capacity: '40',
    classTeacherId: '',
    isActive: true,
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    const current = sessions.find((s) => s.isCurrent) ?? sessions[0];
    if (current && !form.academicSessionId) {
      setForm((prev) => ({ ...prev, academicSessionId: current.id }));
    }
  }, [sessions, form.academicSessionId]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New class"
      description="A class belongs to one course and one academic session."
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
                name: form.name.trim(),
                courseId: form.courseId,
                academicSessionId: form.academicSessionId,
                capacity: Number(form.capacity || 40),
                classTeacherId: form.classTeacherId || null,
                isActive: form.isActive,
              });
            }}
          >
            Create class
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Class name" htmlFor="class-name" required error={errors.name}>
          <Input
            id="class-name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Grade 9 — Section A"
          />
        </Field>

        <Field label="Course" htmlFor="class-course" required error={errors.courseId}>
          <Select
            id="class-course"
            value={form.courseId}
            onChange={(e) => setForm((p) => ({ ...p, courseId: e.target.value }))}
          >
            <option value="">Choose a course…</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Academic session" htmlFor="class-session" required error={errors.academicSessionId}>
          <Select
            id="class-session"
            value={form.academicSessionId}
            onChange={(e) => setForm((p) => ({ ...p, academicSessionId: e.target.value }))}
          >
            <option value="">Choose a session…</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.isCurrent ? ' (current)' : ''}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Capacity"
          htmlFor="class-capacity"
          required
          hint="Enrolment is blocked once this is reached."
        >
          <Input
            id="class-capacity"
            type="number"
            min="1"
            max="500"
            value={form.capacity}
            onChange={(e) => setForm((p) => ({ ...p, capacity: e.target.value }))}
          />
        </Field>

        <Field label="Class teacher" htmlFor="class-teacher" className="sm:col-span-2">
          <Select
            id="class-teacher"
            value={form.classTeacherId}
            onChange={(e) => setForm((p) => ({ ...p, classTeacherId: e.target.value }))}
          >
            <option value="">Not assigned</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.user.name} ({t.employeeCode})
              </option>
            ))}
          </Select>
        </Field>

        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
            <Checkbox
              checked={form.isActive}
              onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
            />
            Active
          </label>
        </div>
      </div>
    </Modal>
  );
}

function ClassDetailModal({
  open,
  detail,
  loading,
  onClose,
  teachers,
  pending,
  run,
  onChanged,
}: {
  open: boolean;
  detail: ClassDetail | null;
  loading: boolean;
  onClose: () => void;
  teachers: Array<{ id: string; user: { name: string }; employeeCode: string }>;
  pending: boolean;
  run: ReturnType<typeof useMutation>['run'];
  onChanged: () => void;
}) {
  const [tab, setTab] = React.useState<'students' | 'subjects' | 'batches'>('students');
  const [batchOpen, setBatchOpen] = React.useState(false);
  const [batchName, setBatchName] = React.useState('');
  const [batchCapacity, setBatchCapacity] = React.useState('30');
  const [capacityEdit, setCapacityEdit] = React.useState('');
  const [teacherEdit, setTeacherEdit] = React.useState('');

  React.useEffect(() => {
    if (detail) {
      setCapacityEdit(String(detail.capacity));
      setTeacherEdit(detail.classTeacher?.id ?? '');
    }
  }, [detail]);


  const saveSettings = async () => {
    if (!detail) return;
    const result = await run(
      () =>
        api.put('/api/admin/classes', {
          action: 'update',
          id: detail.id,
          values: {
            capacity: Number(capacityEdit),
            classTeacherId: teacherEdit || null,
          },
        }),
      { success: 'Class updated.' },
    );
    if (result) onChanged();
  };

  const createBatch = async () => {
    if (!detail) return;
    const result = await run(
      () =>
        api.put('/api/admin/classes', {
          action: 'createBatch',
          classSectionId: detail.id,
          name: batchName.trim(),
          capacity: Number(batchCapacity || 30),
        }),
      { success: 'Batch created.' },
    );
    if (result) {
      setBatchOpen(false);
      setBatchName('');
      onChanged();
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={detail ? detail.name : 'Loading class…'}
        description={
          detail
            ? `${detail.course.name} · ${detail.academicSession.name}`
            : 'Fetching class details'
        }
        size="xl"
        footer={
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        }
      >
        {!detail ? (
          <div className="py-10 text-center text-sm text-[var(--ink-muted)]">
            {loading ? 'Loading class…' : 'This class could not be loaded.'}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Capacity"
                htmlFor="detail-capacity"
                hint="Cannot be lower than the current roll."
              >
                <Input
                  id="detail-capacity"
                  type="number"
                  min={detail.enrollments.length}
                  value={capacityEdit}
                  onChange={(e) => setCapacityEdit(e.target.value)}
                />
              </Field>

              <Field label="Class teacher" htmlFor="detail-teacher">
                <Select
                  id="detail-teacher"
                  value={teacherEdit}
                  onChange={(e) => setTeacherEdit(e.target.value)}
                >
                  <option value="">Not assigned</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.user.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="flex items-end pb-1">
                <Button onClick={saveSettings} loading={pending} className="w-full">
                  <UserCog />
                  Save settings
                </Button>
              </div>
            </div>

            <div className="flex gap-1 border-b border-[var(--line)]">
              {(
                [
                  ['students', `Students (${detail.enrollments.length})`],
                  ['subjects', `Subjects (${detail.classSubjects.length})`],
                  ['batches', `Batches (${detail.batches.length})`],
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

            {tab === 'students' && (
              <div>
                {detail.enrollments.length === 0 ? (
                  <EmptyState
                    icon={<Users />}
                    title="No students enrolled"
                    description="Admit a student and choose this class, or transfer an existing student here."
                    className="border-0"
                  />
                ) : (
                  <TableWrap>
                    <thead>
                      <tr>
                        <Th>Roll</Th>
                        <Th>Student</Th>
                        <Th>Admission no.</Th>
                        <Th>Enrolled</Th>
                        <Th>Status</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.enrollments.map((enrolment) => (
                        <Tr key={enrolment.id}>
                          <Td className="tabular text-xs text-[var(--ink-muted)]">
                            {enrolment.rollNo ?? '—'}
                          </Td>
                          <Td>
                            <span className="text-sm font-medium text-[var(--ink)]">
                              {enrolment.student.firstName} {enrolment.student.lastName}
                            </span>
                          </Td>
                          <Td className="tabular text-xs">{enrolment.student.admissionNo}</Td>
                          <Td className="text-xs text-[var(--ink-muted)]">
                            {formatDate(enrolment.enrolledAt)}
                          </Td>
                          <Td>
                            <Badge tone={enrolment.student.status === 'ACTIVE' ? 'success' : 'warning'}>
                              {titleCase(enrolment.student.status)}
                            </Badge>
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </TableWrap>
                )}
              </div>
            )}

            {tab === 'subjects' && (
              <div>
                {detail.classSubjects.length === 0 ? (
                  <EmptyState
                    icon={<BookOpen />}
                    title="No subjects attached"
                    description="Attach subjects to this class so teachers can be assigned and marks recorded."
                    className="border-0"
                  />
                ) : (
                  <ul className="divide-y divide-[var(--line)] rounded-lg border border-[var(--line)]">
                    {detail.classSubjects.map((link) => (
                      <li key={link.id} className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-sm text-[var(--ink)]">{link.subject.name}</span>
                        <span className="tabular text-xs text-[var(--ink-subtle)]">
                          {link.subject.code}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {tab === 'batches' && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => setBatchOpen(true)}>
                    <Plus />
                    Add batch
                  </Button>
                </div>

                {detail.batches.length === 0 ? (
                  <EmptyState
                    icon={<Layers />}
                    title="No batches"
                    description="Batches split a large class into smaller teaching groups."
                    className="border-0"
                  />
                ) : (
                  <ul className="divide-y divide-[var(--line)] rounded-lg border border-[var(--line)]">
                    {detail.batches.map((batch) => (
                      <li key={batch.id} className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-sm text-[var(--ink)]">{batch.name}</span>
                        <Badge tone="brand">Capacity {batch.capacity}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        title="Add a batch"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setBatchOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={createBatch} loading={pending} disabled={!batchName.trim()}>
              Create batch
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Batch name" htmlFor="batch-name" required>
            <Input
              id="batch-name"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="e.g. Batch B — Evening"
            />
          </Field>

          <Field label="Capacity" htmlFor="batch-capacity">
            <Input
              id="batch-capacity"
              type="number"
              min="1"
              value={batchCapacity}
              onChange={(e) => setBatchCapacity(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}

export { Card, CardHeader };
