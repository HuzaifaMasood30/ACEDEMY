'use client';

import * as React from 'react';
import { BookOpen, Briefcase, CalendarClock, Plus, RefreshCw, Users } from 'lucide-react';
import { Alert, Badge, Button, Checkbox, Field, Input, Select } from '@/components/ui/primitives';
import { Card, CardHeader, EmptyState, PageHeader, StatCard, TableWrap, Td, Th, Tr } from '@/components/ui/structure';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Modal } from '@/components/ui/overlays';
import { api } from '@/lib/client-api';
import { useMutation, useResource } from '@/lib/use-resource';
import { formatDate, formatNumber, titleCase } from '@/lib/format';

interface TeacherRow {
  id: string;
  employeeCode: string;
  designation: string | null;
  department: string | null;
  qualification: string | null;
  employmentType: string;
  maxWeeklyPeriods: number;
  joiningDate: string | null;
  isActive: boolean;
  user: { id: string; name: string; email: string; phone: string | null; status: string };
  teacherSubjects: Array<{ subject: { id: string; name: string; code: string } }>;
  _count: { timetableSlots: number; classTeacherOf: number; assignments: number };
}

interface WorkloadRow {
  teacherProfileId: string;
  name: string;
  employeeCode: string;
  maxWeeklyPeriods: number;
  assignedPeriods: number;
  utilisation: number;
  subjects: number;
  classes: number;
  status: 'OVERLOADED' | 'BALANCED' | 'UNDERUSED';
}

interface SubjectOption {
  id: string;
  name: string;
  code: string;
}

export function TeachersClient() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [includeInactive, setIncludeInactive] = React.useState(false);
  const [tab, setTab] = React.useState<'directory' | 'workload'>('directory');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [detailId, setDetailId] = React.useState<string | null>(null);

  const { run, pending } = useMutation();

  const resource = useResource<TeacherRow>('/api/admin/teachers', {
    params: { page, pageSize: 20, q: search, includeInactive: includeInactive ? 'true' : '' },
    debounceMs: 250,
  });

  const workload = useResource<WorkloadRow>('/api/admin/teachers', {
    params: { scope: 'workload' },
    enabled: tab === 'workload',
  });

  const workloadRows = workload.rows as unknown as WorkloadRow[];

  const columns: Column<TeacherRow>[] = [
    {
      key: 'name',
      header: 'Teacher',
      sortable: true,
      cell: (row) => (
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => setDetailId(row.id)}
            className="block truncate text-left text-sm font-medium text-[var(--ink)] hover:text-[var(--brand)]"
          >
            {row.user.name}
          </button>
          <span className="block truncate text-[0.6875rem] text-[var(--ink-subtle)]">
            {row.employeeCode} · {row.user.email}
          </span>
        </div>
      ),
    },
    {
      key: 'department',
      header: 'Department',
      hideBelow: 'md',
      cell: (row) => (
        <div>
          <span className="block text-sm text-[var(--ink)]">{row.department ?? '—'}</span>
          <span className="block text-[0.6875rem] text-[var(--ink-subtle)]">
            {row.designation ?? titleCase(row.employmentType)}
          </span>
        </div>
      ),
    },
    {
      key: 'subjects',
      header: 'Subjects',
      hideBelow: 'lg',
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.teacherSubjects.length === 0 ? (
            <span className="text-xs text-[var(--ink-subtle)]">None</span>
          ) : (
            row.teacherSubjects.slice(0, 3).map((link) => (
              <Badge key={link.subject.id} tone="brand">
                {link.subject.code}
              </Badge>
            ))
          )}
          {row.teacherSubjects.length > 3 && (
            <Badge tone="neutral">+{row.teacherSubjects.length - 3}</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'periods',
      header: 'Weekly load',
      align: 'right',
      cell: (row) => {
        const load = row._count.timetableSlots;
        const ratio = row.maxWeeklyPeriods > 0 ? load / row.maxWeeklyPeriods : 0;
        return (
          <div className="text-right">
            <span className="tabular block text-sm">
              {load}/{row.maxWeeklyPeriods}
            </span>
            <span
              className={
                ratio > 1
                  ? 'block text-[0.6875rem] font-medium text-[var(--danger)]'
                  : ratio > 0.85
                    ? 'block text-[0.6875rem] text-[var(--warn)]'
                    : 'block text-[0.6875rem] text-[var(--ink-subtle)]'
              }
            >
              {Math.round(ratio * 100)}% used
            </span>
          </div>
        );
      },
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
  ];

  const workloadColumns: Column<WorkloadRow>[] = [
    {
      key: 'name',
      header: 'Teacher',
      cell: (row) => (
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium text-[var(--ink)]">{row.name}</span>
          <span className="block text-[0.6875rem] text-[var(--ink-subtle)]">{row.employeeCode}</span>
        </div>
      ),
    },
    {
      key: 'assignedPeriods',
      header: 'Assigned',
      align: 'right',
      cell: (row) => <span className="tabular text-sm">{row.assignedPeriods}</span>,
    },
    {
      key: 'maxWeeklyPeriods',
      header: 'Maximum',
      align: 'right',
      hideBelow: 'sm',
      cell: (row) => (
        <span className="tabular text-sm text-[var(--ink-muted)]">{row.maxWeeklyPeriods}</span>
      ),
    },
    {
      key: 'utilisation',
      header: 'Utilisation',
      align: 'right',
      cell: (row) => (
        <div className="flex items-center justify-end gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <div
              className={
                row.utilisation > 100
                  ? 'h-full rounded-full bg-[var(--danger)]'
                  : row.utilisation > 85
                    ? 'h-full rounded-full bg-[var(--warn)]'
                    : 'h-full rounded-full bg-[var(--ok)]'
              }
              style={{ width: `${Math.min(100, row.utilisation)}%` }}
            />
          </div>
          <span className="tabular w-10 text-right text-sm">{row.utilisation}%</span>
        </div>
      ),
    },
    {
      key: 'subjects',
      header: 'Subjects',
      align: 'right',
      hideBelow: 'md',
      cell: (row) => <span className="tabular text-sm">{row.subjects}</span>,
    },
    {
      key: 'classes',
      header: 'Classes',
      align: 'right',
      hideBelow: 'md',
      cell: (row) => <span className="tabular text-sm">{row.classes}</span>,
    },
    {
      key: 'status',
      header: 'Balance',
      cell: (row) => (
        <Badge
          tone={
            row.status === 'OVERLOADED' ? 'danger' : row.status === 'BALANCED' ? 'success' : 'warning'
          }
        >
          {titleCase(row.status)}
        </Badge>
      ),
    },
  ];

  const overloaded = workloadRows.filter((r) => r.status === 'OVERLOADED').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teachers and staff"
        description="Teaching staff, their subjects, weekly load and portal accounts."
        breadcrumbs={[{ label: 'People' }, { label: 'Teachers' }]}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            Add teacher
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Teachers" value={formatNumber(resource.meta?.total ?? 0)} icon={<Users />} tone="brand" />
        <StatCard
          label="Class teachers"
          value={formatNumber(resource.rows.reduce((s, r) => s + r._count.classTeacherOf, 0))}
          icon={<Briefcase />}
          tone="info"
        />
        <StatCard
          label="Weekly periods assigned"
          value={formatNumber(resource.rows.reduce((s, r) => s + r._count.timetableSlots, 0))}
          icon={<CalendarClock />}
          tone="accent"
        />
        <StatCard
          label="Overloaded"
          value={formatNumber(overloaded)}
          icon={<BookOpen />}
          tone={overloaded > 0 ? 'warning' : 'success'}
          hint={tab === 'workload' ? 'Based on the workload tab' : 'Open the workload tab'}
        />
      </div>

      {resource.error && (
        <Alert tone="danger" title="Could not load teachers">
          {resource.error}
        </Alert>
      )}

      <div className="flex gap-1 border-b border-[var(--line)]">
        {(
          [
            ['directory', 'Directory'],
            ['workload', 'Workload'],
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

      {tab === 'directory' ? (
        <DataTable<TeacherRow>
          columns={columns}
          rows={resource.rows}
          rowKey={(row) => row.id}
          loading={resource.loading}
          searchable
          searchPlaceholder="Search by name, email or employee code…"
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
          emptyTitle="No teachers yet"
          emptyDescription="Add a teacher to assign them subjects and classes."
          emptyAction={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              Add teacher
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
      ) : (
        <DataTable<WorkloadRow>
          columns={workloadColumns}
          rows={workloadRows}
          rowKey={(row) => row.teacherProfileId}
          loading={workload.loading}
          emptyTitle="No workload data"
          emptyDescription="Assign teachers to timetable slots to see their load."
          toolbarExtra={
            <Button variant="outline" size="sm" onClick={workload.reload} loading={workload.refreshing}>
              <RefreshCw />
              Refresh
            </Button>
          }
        />
      )}

      <CreateTeacherModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        pending={pending}
        onSubmit={async (payload) => {
          const result = await run(() => api.post('/api/admin/teachers', payload), {
            success: 'Teacher created.',
          });
          if (result) {
            setCreateOpen(false);
            resource.reload();
          }
        }}
      />

      <TeacherDetailModal
        open={Boolean(detailId)}
        teacherId={detailId}
        onClose={() => setDetailId(null)}
        pending={pending}
        run={run}
        onChanged={() => {
          resource.reload();
          workload.reload();
        }}
      />
    </div>
  );
}

function CreateTeacherModal({
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
  const [subjects, setSubjects] = React.useState<SubjectOption[]>([]);
  const [form, setForm] = React.useState({
    name: '',
    email: '',
    phone: '',
    employeeCode: '',
    designation: '',
    department: '',
    qualification: '',
    employmentType: 'FULL_TIME',
    maxWeeklyPeriods: '24',
    initialPassword: '',
    subjectIds: [] as string[],
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open) return;
    api
      .getOne<{ rows: SubjectOption[] }>('/api/admin/subjects', { pageSize: 200 })
      .then((data) => setSubjects(data.rows ?? []))
      .catch(() => undefined);
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a teacher"
      description="Creates a teacher profile and a portal login in one step."
      size="lg"
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
                email: form.email.trim().toLowerCase(),
                phone: form.phone.trim() || null,
                employeeCode: form.employeeCode.trim().toUpperCase(),
                designation: form.designation.trim() || null,
                department: form.department.trim() || null,
                qualification: form.qualification.trim() || null,
                employmentType: form.employmentType,
                maxWeeklyPeriods: Number(form.maxWeeklyPeriods || 24),
                initialPassword: form.initialPassword || null,
                subjectIds: form.subjectIds,
              });
            }}
          >
            Create teacher
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="t-name" required error={errors.name}>
          <Input
            id="t-name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
        </Field>

        <Field label="Email" htmlFor="t-email" required error={errors.email}>
          <Input
            id="t-email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
          />
        </Field>

        <Field
          label="Employee code"
          htmlFor="t-code"
          required
          hint="Unique staff identifier."
          error={errors.employeeCode}
        >
          <Input
            id="t-code"
            value={form.employeeCode}
            onChange={(e) => setForm((p) => ({ ...p, employeeCode: e.target.value.toUpperCase() }))}
            placeholder="EMP-0007"
          />
        </Field>

        <Field label="Phone" htmlFor="t-phone">
          <Input
            id="t-phone"
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
          />
        </Field>

        <Field label="Designation" htmlFor="t-designation">
          <Input
            id="t-designation"
            value={form.designation}
            onChange={(e) => setForm((p) => ({ ...p, designation: e.target.value }))}
            placeholder="e.g. Senior Teacher"
          />
        </Field>

        <Field label="Department" htmlFor="t-department">
          <Input
            id="t-department"
            value={form.department}
            onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
          />
        </Field>

        <Field label="Qualification" htmlFor="t-qualification">
          <Input
            id="t-qualification"
            value={form.qualification}
            onChange={(e) => setForm((p) => ({ ...p, qualification: e.target.value }))}
          />
        </Field>

        <Field label="Employment type" htmlFor="t-employment">
          <Select
            id="t-employment"
            value={form.employmentType}
            onChange={(e) => setForm((p) => ({ ...p, employmentType: e.target.value }))}
          >
            <option value="FULL_TIME">Full time</option>
            <option value="PART_TIME">Part time</option>
            <option value="CONTRACT">Contract</option>
            <option value="VISITING">Visiting</option>
          </Select>
        </Field>

        <Field
          label="Maximum weekly periods"
          htmlFor="t-max"
          hint="Used to flag an overloaded timetable."
        >
          <Input
            id="t-max"
            type="number"
            min="1"
            max="60"
            value={form.maxWeeklyPeriods}
            onChange={(e) => setForm((p) => ({ ...p, maxWeeklyPeriods: e.target.value }))}
          />
        </Field>

        <Field
          label="Initial password"
          htmlFor="t-password"
          hint="Leave blank to generate one; share it securely either way."
          error={errors.initialPassword}
        >
          <Input
            id="t-password"
            value={form.initialPassword}
            onChange={(e) => setForm((p) => ({ ...p, initialPassword: e.target.value }))}
          />
        </Field>

        <Field label="Subjects" htmlFor="t-subjects" className="sm:col-span-2">
          <div
            id="t-subjects"
            className="scrollbar-slim max-h-44 space-y-1 overflow-y-auto rounded-md border border-[var(--line-strong)] p-2.5"
          >
            {subjects.length === 0 ? (
              <p className="p-2 text-xs text-[var(--ink-subtle)]">No subjects defined yet.</p>
            ) : (
              subjects.map((subject) => (
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
                  {subject.name}
                  <span className="text-xs text-[var(--ink-subtle)]">{subject.code}</span>
                </label>
              ))
            )}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

interface TeacherDetail {
  id: string;
  employeeCode: string;
  designation: string | null;
  department: string | null;
  qualification: string | null;
  employmentType: string;
  maxWeeklyPeriods: number;
  joiningDate: string | null;
  isActive: boolean;
  user: { id: string; name: string; email: string; phone: string | null; status: string };
  teacherSubjects: Array<{
    id: string;
    subject: { id: string; name: string; code: string };
  }>;
  classTeacherOf: Array<{ id: string; name: string; course: { name: string } }>;
  leaveRequests: Array<{
    id: string;
    startDate: string;
    endDate: string;
    leaveType: string;
    reason: string | null;
    status: string;
    createdAt: string;
  }>;
  _count: { timetableSlots: number; assignments: number };
}

function TeacherDetailModal({
  open,
  teacherId,
  onClose,
  pending,
  run,
  onChanged,
}: {
  open: boolean;
  teacherId: string | null;
  onClose: () => void;
  pending: boolean;
  run: ReturnType<typeof useMutation>['run'];
  onChanged: () => void;
}) {
  const [teacher, setTeacher] = React.useState<TeacherDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [resetOpen, setResetOpen] = React.useState(false);
  const [newPassword, setNewPassword] = React.useState('');

  const load = React.useCallback(async () => {
    if (!teacherId) return;
    setLoading(true);
    try {
      const data = await api.getOne<TeacherDetail>('/api/admin/teachers', {
        scope: 'profile',
        id: teacherId,
      });
      setTeacher(data);
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  React.useEffect(() => {
    if (open) void load();
    else setTeacher(null);
  }, [open, load]);

  const toggleActive = async () => {
    if (!teacher) return;
    const result = await run(
      () =>
        api.put('/api/admin/teachers', {
          action: 'update',
          id: teacher.id,
          values: { isActive: !teacher.isActive },
        }),
      { success: teacher.isActive ? 'Teacher deactivated.' : 'Teacher reactivated.' },
    );
    if (result) {
      await load();
      onChanged();
    }
  };

  const resetPassword = async () => {
    if (!teacher) return;
    const result = await run(
      () =>
        api.put('/api/admin/teachers', {
          action: 'resetPassword',
          teacherProfileId: teacher.id,
          newPassword,
        }),
      { success: 'Password reset. Existing sessions were signed out.' },
    );
    if (result) {
      setResetOpen(false);
      setNewPassword('');
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={teacher ? teacher.user.name : 'Loading…'}
        description={teacher ? `${teacher.employeeCode} · ${teacher.user.email}` : undefined}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button variant="outline" onClick={() => setResetOpen(true)} disabled={!teacher}>
              Reset password
            </Button>
            <Button
              variant={teacher?.isActive ? 'dangerSoft' : 'success'}
              onClick={toggleActive}
              loading={pending}
              disabled={!teacher}
            >
              {teacher?.isActive ? 'Deactivate' : 'Reactivate'}
            </Button>
          </>
        }
      >
        {loading || !teacher ? (
          <div className="py-10 text-center text-sm text-[var(--ink-muted)]">Loading…</div>
        ) : (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ['Designation', teacher.designation ?? '—'],
                ['Department', teacher.department ?? '—'],
                ['Employment', titleCase(teacher.employmentType)],
                ['Joined', teacher.joiningDate ? formatDate(teacher.joiningDate) : '—'],
                ['Qualification', teacher.qualification ?? '—'],
                ['Max weekly periods', String(teacher.maxWeeklyPeriods)],
                ['Timetable slots', String(teacher._count.timetableSlots)],
                ['Assignments', String(teacher._count.assignments)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-[var(--ink-subtle)]">{label}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-[var(--ink)]">{value}</dd>
                </div>
              ))}
            </dl>

            <Card>
              <CardHeader
                title="Subjects taught"
                description={`${teacher.teacherSubjects.length} assigned`}
                icon={<BookOpen />}
              />
              {teacher.teacherSubjects.length === 0 ? (
                <EmptyState
                  icon={<BookOpen />}
                  title="No subjects assigned"
                  description="Assign subjects so this teacher can be placed on the timetable."
                  className="border-0"
                />
              ) : (
                <ul className="flex flex-wrap gap-2 p-4">
                  {teacher.teacherSubjects.map((link) => (
                    <li key={link.id}>
                      <Badge tone="brand">
                        {link.subject.name} · {link.subject.code}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {teacher.classTeacherOf.length > 0 && (
              <Card>
                <CardHeader
                  title="Class teacher of"
                  description={`${teacher.classTeacherOf.length} class(es)`}
                />
                <ul className="divide-y divide-[var(--line)]">
                  {teacher.classTeacherOf.map((section) => (
                    <li key={section.id} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-sm text-[var(--ink)]">{section.name}</span>
                      <span className="text-xs text-[var(--ink-subtle)]">{section.course.name}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card>
              <CardHeader
                title="Recent leave requests"
                description={`${teacher.leaveRequests.length} most recent`}
                icon={<CalendarClock />}
              />
              {teacher.leaveRequests.length === 0 ? (
                <EmptyState
                  icon={<CalendarClock />}
                  title="No leave requests"
                  description="Requests submitted from the teacher portal appear here."
                  className="border-0"
                />
              ) : (
                <TableWrap>
                  <thead>
                    <tr>
                      <Th>From</Th>
                      <Th>To</Th>
                      <Th>Type</Th>
                      <Th>Status</Th>
                      <Th>Reason</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {teacher.leaveRequests.map((leave) => (
                      <Tr key={leave.id}>
                        <Td className="tabular text-xs">{formatDate(leave.startDate)}</Td>
                        <Td className="tabular text-xs">{formatDate(leave.endDate)}</Td>
                        <Td className="text-xs">{titleCase(leave.leaveType)}</Td>
                        <Td>
                          <Badge
                            tone={
                              leave.status === 'APPROVED'
                                ? 'success'
                                : leave.status === 'REJECTED'
                                  ? 'danger'
                                  : 'warning'
                            }
                          >
                            {titleCase(leave.status)}
                          </Badge>
                        </Td>
                        <Td className="max-w-[16rem] truncate text-xs text-[var(--ink-muted)]">
                          {leave.reason ?? '—'}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </TableWrap>
              )}
            </Card>
          </div>
        )}
      </Modal>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset password"
        description="Every existing session for this teacher is signed out immediately."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setResetOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={resetPassword}
              loading={pending}
              disabled={newPassword.length < 8}
            >
              Reset password
            </Button>
          </>
        }
      >
        <Field
          label="New password"
          htmlFor="reset-password"
          required
          hint="At least 8 characters."
        >
          <Input
            id="reset-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </Field>
      </Modal>
    </>
  );
}
