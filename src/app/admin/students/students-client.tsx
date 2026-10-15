'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  BadgeCheck,
  Download,
  FileSpreadsheet,
  Filter,
  GraduationCap,
  Plus,
  RefreshCw,
  Upload,
  UserCheck,
  Users,
} from 'lucide-react';
import { Badge, Button, Field, Input, Select, Textarea, Checkbox, Alert } from '@/components/ui/primitives';
import { Card, EmptyState, PageHeader, StatCard, TableWrap, Td, Th, Tr } from '@/components/ui/structure';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Modal, ConfirmDialog, Tabs } from '@/components/ui/overlays';
import { api, ApiError } from '@/lib/client-api';
import { useMutation, useResource } from '@/lib/use-resource';
import { formatDate, formatNumber, titleCase } from '@/lib/format';

interface GuardianRow {
  id: string;
  relation: string;
  isPrimary: boolean;
  contactPhone: string | null;
  canViewFees: boolean;
  canViewResults: boolean;
  guardianUser: { id: string; name: string; email: string; phone: string | null };
}

interface StudentRow {
  id: string;
  admissionNo: string;
  rollNo: string | null;
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string | null;
  photoUrl: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  admissionDate: string;
  guardians: GuardianRow[];
  enrollments: Array<{
    id: string;
    rollNo: string | null;
    classSection: { id: string; name: string; course: { name: string } };
    batch: { id: string; name: string } | null;
    academicSession: { id: string; name: string };
  }>;
}

interface ClassOption {
  id: string;
  name: string;
  capacity: number;
  course: { name: string };
  _count: { enrollments: number };
}

interface OptionsPayload {
  classes: ClassOption[];
  sessions: Array<{ id: string; name: string; code: string; isCurrent: boolean }>;
  batches: Array<{ id: string; name: string; classSectionId: string }>;
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'brand'> = {
  ACTIVE: 'success',
  APPLICANT: 'info',
  INACTIVE: 'brand',
  TRANSFERRED: 'warning',
  GRADUATED: 'info',
  WITHDRAWN: 'danger',
};

const emptyGuardian = {
  name: '',
  email: '',
  phone: '',
  relation: 'FATHER',
  isPrimary: true,
  canViewFees: true,
  canViewResults: true,
  receivesNotifications: true,
};

export function StudentsClient() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [classSectionId, setClassSectionId] = React.useState('');
  const [sortKey, setSortKey] = React.useState('name');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');

  const [admitOpen, setAdmitOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [detail, setDetail] = React.useState<StudentRow | null>(null);

  const { run, pending } = useMutation();

  const resource = useResource<StudentRow>('/api/admin/students', {
    params: { page, pageSize: 20, q: search, status, classSectionId, sort: sortKey, dir: sortDir },
    debounceMs: 250,
  });

  const options = useResource<OptionsPayload>('/api/admin/students', {
    params: { scope: 'options' },
  });

  const optionsData = options.rows as unknown as OptionsPayload | undefined;

  // The options endpoint returns a single object, not a list.
  const [classOptions, setClassOptions] = React.useState<ClassOption[]>([]);
  const [sessionOptions, setSessionOptions] = React.useState<OptionsPayload['sessions']>([]);

  React.useEffect(() => {
    let cancelled = false;
    api
      .getOne<OptionsPayload>('/api/admin/students', { scope: 'options' })
      .then((data) => {
        if (cancelled) return;
        setClassOptions(data.classes);
        setSessionOptions(data.sessions);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  void optionsData;

  const columns: Column<StudentRow>[] = [
    {
      key: 'name',
      header: 'Student',
      sortable: true,
      cell: (row) => (
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-xs font-semibold text-[var(--brand-soft-ink)]">
            {row.firstName.charAt(0)}
            {row.lastName.charAt(0)}
          </span>
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => setDetail(row)}
              className="block truncate text-left text-sm font-medium text-[var(--ink)] hover:text-[var(--brand)]"
            >
              {row.firstName} {row.lastName}
            </button>
            <span className="tabular block text-[0.6875rem] text-[var(--ink-subtle)]">
              {row.admissionNo}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'class',
      header: 'Class',
      cell: (row) => {
        const enrollment = row.enrollments[0];
        if (!enrollment) return <span className="text-[var(--ink-subtle)]">Not enrolled</span>;
        return (
          <div>
            <span className="block text-sm text-[var(--ink)]">{enrollment.classSection.name}</span>
            <span className="block text-[0.6875rem] text-[var(--ink-subtle)]">
              {enrollment.classSection.course.name}
              {enrollment.batch ? ` · ${enrollment.batch.name}` : ''}
            </span>
          </div>
        );
      },
    },
    {
      key: 'guardian',
      header: 'Guardian',
      hideBelow: 'lg',
      cell: (row) => {
        const guardian = row.guardians.find((g) => g.isPrimary) ?? row.guardians[0];
        if (!guardian) return <span className="text-[var(--ink-subtle)]">None</span>;
        return (
          <div className="min-w-0">
            <span className="block truncate text-sm text-[var(--ink)]">
              {guardian.guardianUser.name}
            </span>
            <span className="block truncate text-[0.6875rem] text-[var(--ink-subtle)]">
              {guardian.contactPhone ?? guardian.guardianUser.phone ?? guardian.guardianUser.email}
            </span>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <Badge tone={STATUS_TONE[row.status] ?? 'brand'}>{titleCase(row.status)}</Badge>
      ),
    },
    {
      key: 'admissionDate',
      header: 'Admitted',
      align: 'right',
      hideBelow: 'md',
      sortable: true,
      cell: (row) => (
        <span className="tabular text-xs text-[var(--ink-muted)]">
          {formatDate(row.admissionDate)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <Link href={`/admin/students/${row.id}`}>
          <Button variant="ghost" size="sm">
            Open
          </Button>
        </Link>
      ),
    },
  ];

  const totalActive = resource.rows.filter((r) => r.status === 'ACTIVE').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        description="Admissions, enrolment and student records."
        breadcrumbs={[{ label: 'People' }, { label: 'Students' }]}
        actions={
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload />
              Import CSV
            </Button>
            <Button onClick={() => setAdmitOpen(true)}>
              <Plus />
              Admit student
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total students"
          value={formatNumber(resource.meta?.total ?? 0)}
          icon={<Users />}
          tone="brand"
          hint="Matching the current filters"
        />
        <StatCard
          label="Active on this page"
          value={formatNumber(totalActive)}
          icon={<UserCheck />}
          tone="success"
        />
        <StatCard
          label="Classes available"
          value={formatNumber(classOptions.length)}
          icon={<GraduationCap />}
          tone="info"
        />
        <StatCard
          label="Current session"
          value={sessionOptions.find((s) => s.isCurrent)?.name ?? 'Not set'}
          icon={<BadgeCheck />}
          tone="brand"
        />
      </div>

      {resource.error && (
        <Alert tone="danger" title="Could not load students">
          {resource.error}
        </Alert>
      )}

      <DataTable<StudentRow>
        columns={columns}
        rows={resource.rows}
        rowKey={(row) => row.id}
        loading={resource.loading}
        searchable
        searchPlaceholder="Search by name, admission number, email or phone…"
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
              { value: 'ACTIVE', label: 'Active' },
              { value: 'APPLICANT', label: 'Applicant' },
              { value: 'INACTIVE', label: 'Inactive' },
              { value: 'TRANSFERRED', label: 'Transferred' },
              { value: 'GRADUATED', label: 'Graduated' },
              { value: 'WITHDRAWN', label: 'Withdrawn' },
            ],
          },
          {
            key: 'classSectionId',
            label: 'Class',
            options: classOptions.map((c) => ({
              value: c.id,
              label: `${c.name} (${c._count.enrollments}/${c.capacity})`,
            })),
          },
        ]}
        filterValues={{ status, classSectionId }}
        onFilterChange={(key, value) => {
          if (key === 'status') setStatus(value);
          if (key === 'classSectionId') setClassSectionId(value);
          setPage(1);
        }}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
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
        emptyTitle="No students found"
        emptyDescription="Adjust the filters, or admit the academy's first student."
        emptyAction={
          <Button onClick={() => setAdmitOpen(true)}>
            <Plus />
            Admit student
          </Button>
        }
        toolbarExtra={
          <Button variant="outline" size="sm" onClick={resource.reload} loading={resource.refreshing}>
            <RefreshCw />
            Refresh
          </Button>
        }
      />

      <AdmitStudentModal
        open={admitOpen}
        onClose={() => setAdmitOpen(false)}
        classes={classOptions}
        sessions={sessionOptions}
        pending={pending}
        onSubmit={async (payload) => {
          const result = await run(
            () => api.post<{ id: string; admissionNo: string }>('/api/admin/students', payload),
            { success: 'Student admitted.' },
          );

          if (result) {
            setAdmitOpen(false);
            resource.reload();
          }
        }}
      />

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        classes={classOptions}
        sessions={sessionOptions}
        pending={pending}
        onImported={() => {
          setImportOpen(false);
          resource.reload();
        }}
        run={run}
      />

      <StudentDetailDrawer
        student={detail}
        onClose={() => setDetail(null)}
        onChanged={() => {
          setDetail(null);
          resource.reload();
        }}
        run={run}
        pending={pending}
      />
    </div>
  );
}

/* --------------------------------------------------------------------------
   Admit student
   -------------------------------------------------------------------------- */

function AdmitStudentModal({
  open,
  onClose,
  classes,
  sessions,
  pending,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  classes: ClassOption[];
  sessions: OptionsPayload['sessions'];
  pending: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [step, setStep] = React.useState<'student' | 'guardian' | 'enrolment'>('student');
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const [form, setForm] = React.useState({
    firstName: '',
    lastName: '',
    gender: 'UNDISCLOSED',
    dateOfBirth: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    bloodGroup: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    previousSchool: '',
    notes: '',
  });

  const [guardians, setGuardians] = React.useState([{ ...emptyGuardian }]);

  const currentSession = sessions.find((s) => s.isCurrent) ?? sessions[0];

  const [enrolment, setEnrolment] = React.useState({
    classSectionId: '',
    academicSessionId: '',
    rollNo: '',
    createLogin: false,
    initialPassword: '',
  });

  React.useEffect(() => {
    if (currentSession && !enrolment.academicSessionId) {
      setEnrolment((prev) => ({ ...prev, academicSessionId: currentSession.id }));
    }
  }, [currentSession, enrolment.academicSessionId]);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const updateGuardian = (index: number, patch: Partial<typeof emptyGuardian>) =>
    setGuardians((prev) => prev.map((g, i) => (i === index ? { ...g, ...patch } : g)));

  const reset = () => {
    setForm({
      firstName: '',
      lastName: '',
      gender: 'UNDISCLOSED',
      dateOfBirth: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      bloodGroup: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      previousSchool: '',
      notes: '',
    });
    setGuardians([{ ...emptyGuardian }]);
    setEnrolment({
      classSectionId: '',
      academicSessionId: currentSession?.id ?? '',
      rollNo: '',
      createLogin: false,
      initialPassword: '',
    });
    setErrors({});
    setStep('student');
  };

  const submit = async () => {
    setErrors({});

    const payload = {
      ...form,
      dateOfBirth: form.dateOfBirth || null,
      email: form.email || null,
      phone: form.phone || null,
      classSectionId: enrolment.classSectionId,
      academicSessionId: enrolment.academicSessionId,
      rollNo: enrolment.rollNo || null,
      createLogin: enrolment.createLogin,
      initialPassword: enrolment.createLogin ? enrolment.initialPassword : null,
      guardians: guardians.map((g) => ({
        ...g,
        email: g.email || null,
        phone: g.phone || null,
      })),
    };

    try {
      await onSubmit(payload);
      reset();
    } catch (caught) {
      if (caught instanceof ApiError) setErrors(caught.fieldErrors);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Admit a new student"
      description="Creates the student record, the guardian links and the enrolment in one step."
      size="lg"
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending}>
            Admit student
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Tabs
          value={step}
          onChange={(value) => setStep(value as typeof step)}
          tabs={[
            { value: 'student', label: 'Student' },
            { value: 'guardian', label: 'Guardian' },
            { value: 'enrolment', label: 'Enrolment' },
          ]}
        />

        {step === 'student' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="firstName" required error={errors.firstName}>
              <Input
                id="firstName"
                value={form.firstName}
                onChange={(e) => set('firstName')(e.target.value)}
                autoComplete="off"
              />
            </Field>

            <Field label="Last name" htmlFor="lastName" required error={errors.lastName}>
              <Input
                id="lastName"
                value={form.lastName}
                onChange={(e) => set('lastName')(e.target.value)}
                autoComplete="off"
              />
            </Field>

            <Field label="Gender" htmlFor="gender">
              <Select
                id="gender"
                value={form.gender}
                onChange={(e) => set('gender')(e.target.value)}
              >
                <option value="UNDISCLOSED">Not stated</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </Select>
            </Field>

            <Field
              label="Date of birth"
              htmlFor="dateOfBirth"
              hint="Used to warn about possible duplicate records."
            >
              <Input
                id="dateOfBirth"
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => set('dateOfBirth')(e.target.value)}
              />
            </Field>

            <Field label="Email" htmlFor="email" error={errors.email}>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => set('email')(e.target.value)}
                autoComplete="off"
              />
            </Field>

            <Field label="Phone" htmlFor="phone" error={errors.phone}>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => set('phone')(e.target.value)}
              />
            </Field>

            <Field label="Address" htmlFor="address" className="sm:col-span-2">
              <Textarea
                id="address"
                rows={2}
                value={form.address}
                onChange={(e) => set('address')(e.target.value)}
              />
            </Field>

            <Field label="City" htmlFor="city">
              <Input id="city" value={form.city} onChange={(e) => set('city')(e.target.value)} />
            </Field>

            <Field label="Blood group" htmlFor="bloodGroup">
              <Input
                id="bloodGroup"
                value={form.bloodGroup}
                onChange={(e) => set('bloodGroup')(e.target.value)}
                placeholder="e.g. O+"
              />
            </Field>

            <Field label="Emergency contact" htmlFor="emergencyContactName">
              <Input
                id="emergencyContactName"
                value={form.emergencyContactName}
                onChange={(e) => set('emergencyContactName')(e.target.value)}
              />
            </Field>

            <Field label="Emergency phone" htmlFor="emergencyContactPhone">
              <Input
                id="emergencyContactPhone"
                value={form.emergencyContactPhone}
                onChange={(e) => set('emergencyContactPhone')(e.target.value)}
              />
            </Field>

            <Field label="Previous school" htmlFor="previousSchool" className="sm:col-span-2">
              <Input
                id="previousSchool"
                value={form.previousSchool}
                onChange={(e) => set('previousSchool')(e.target.value)}
              />
            </Field>
          </div>
        )}

        {step === 'guardian' && (
          <div className="space-y-4">
            <Alert tone="info">
              A guardian account is created for each contact who has an email address. The account
              is inactive until an administrator issues a password.
            </Alert>

            {guardians.map((guardian, index) => (
              <Card key={index} className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[var(--ink)]">
                    Guardian {index + 1}
                  </h3>
                  {guardians.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setGuardians((prev) => prev.filter((_, i) => i !== index))
                      }
                    >
                      Remove
                    </Button>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Name" htmlFor={`g-name-${index}`} required>
                    <Input
                      id={`g-name-${index}`}
                      value={guardian.name}
                      onChange={(e) => updateGuardian(index, { name: e.target.value })}
                    />
                  </Field>

                  <Field label="Relation" htmlFor={`g-relation-${index}`}>
                    <Select
                      id={`g-relation-${index}`}
                      value={guardian.relation}
                      onChange={(e) => updateGuardian(index, { relation: e.target.value })}
                    >
                      <option value="FATHER">Father</option>
                      <option value="MOTHER">Mother</option>
                      <option value="GUARDIAN">Guardian</option>
                      <option value="OTHER">Other</option>
                    </Select>
                  </Field>

                  <Field
                    label="Email"
                    htmlFor={`g-email-${index}`}
                    hint="Required so a portal account can be created."
                  >
                    <Input
                      id={`g-email-${index}`}
                      type="email"
                      value={guardian.email}
                      onChange={(e) => updateGuardian(index, { email: e.target.value })}
                    />
                  </Field>

                  <Field label="Phone" htmlFor={`g-phone-${index}`}>
                    <Input
                      id={`g-phone-${index}`}
                      value={guardian.phone}
                      onChange={(e) => updateGuardian(index, { phone: e.target.value })}
                    />
                  </Field>
                </div>

                <div className="mt-3 flex flex-wrap gap-4 border-t border-[var(--line)] pt-3">
                  {[
                    ['isPrimary', 'Primary contact'],
                    ['receivesNotifications', 'Receives WhatsApp alerts'],
                    ['canViewFees', 'Can view fees'],
                    ['canViewResults', 'Can view results'],
                  ].map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-xs text-[var(--ink-muted)]">
                      <Checkbox
                        checked={guardian[key as keyof typeof guardian] as boolean}
                        onChange={(e) =>
                          updateGuardian(index, { [key]: e.target.checked } as never)
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </Card>
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setGuardians((prev) => [...prev, { ...emptyGuardian, isPrimary: false }])}
            >
              <Plus />
              Add another guardian
            </Button>
          </div>
        )}

        {step === 'enrolment' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Class" htmlFor="classSectionId" required error={errors.classSectionId}>
              <Select
                id="classSectionId"
                value={enrolment.classSectionId}
                onChange={(e) =>
                  setEnrolment((prev) => ({ ...prev, classSectionId: e.target.value }))
                }
              >
                <option value="">Choose a class…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id} disabled={c._count.enrollments >= c.capacity}>
                    {c.name} — {c.course.name} ({c._count.enrollments}/{c.capacity})
                    {c._count.enrollments >= c.capacity ? ' — full' : ''}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Academic session"
              htmlFor="academicSessionId"
              required
              error={errors.academicSessionId}
            >
              <Select
                id="academicSessionId"
                value={enrolment.academicSessionId}
                onChange={(e) =>
                  setEnrolment((prev) => ({ ...prev, academicSessionId: e.target.value }))
                }
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

            <Field label="Roll number" htmlFor="rollNo" hint="Optional; the class list can set it later.">
              <Input
                id="rollNo"
                value={enrolment.rollNo}
                onChange={(e) => setEnrolment((prev) => ({ ...prev, rollNo: e.target.value }))}
              />
            </Field>

            <div className="sm:col-span-2 space-y-3 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-4">
              <label className="flex items-center gap-2.5 text-sm text-[var(--ink)]">
                <Checkbox
                  checked={enrolment.createLogin}
                  onChange={(e) =>
                    setEnrolment((prev) => ({ ...prev, createLogin: e.target.checked }))
                  }
                />
                Create a student portal login
              </label>

              {enrolment.createLogin && (
                <Field
                  label="Initial password"
                  htmlFor="initialPassword"
                  required
                  hint="At least 8 characters. Share it securely and ask the student to change it."
                  error={errors.initialPassword}
                >
                  <Input
                    id="initialPassword"
                    type="text"
                    value={enrolment.initialPassword}
                    onChange={(e) =>
                      setEnrolment((prev) => ({ ...prev, initialPassword: e.target.value }))
                    }
                  />
                </Field>
              )}
            </div>

            <Field label="Notes" htmlFor="notes" className="sm:col-span-2">
              <Textarea
                id="notes"
                rows={2}
                value={form.notes}
                onChange={(e) => set('notes')(e.target.value)}
              />
            </Field>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------------------
   CSV import
   -------------------------------------------------------------------------- */

const IMPORT_HEADERS = [
  'firstName',
  'lastName',
  'gender',
  'dateOfBirth',
  'guardianName',
  'guardianPhone',
  'guardianEmail',
];

/** Minimal RFC-4180 parser: handles quoted fields and embedded commas. */
function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((cell) => cell.trim() !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

function ImportModal({
  open,
  onClose,
  classes,
  sessions,
  pending,
  onImported,
  run,
}: {
  open: boolean;
  onClose: () => void;
  classes: ClassOption[];
  sessions: OptionsPayload['sessions'];
  pending: boolean;
  onImported: () => void;
  run: ReturnType<typeof useMutation>['run'];
}) {
  const [text, setText] = React.useState('');
  const [classSectionId, setClassSectionId] = React.useState('');
  const [academicSessionId, setAcademicSessionId] = React.useState('');
  const [result, setResult] = React.useState<{
    imported: number;
    failed: number;
    results: Array<{ row: number; admissionNo?: string; error?: string }>;
  } | null>(null);

  React.useEffect(() => {
    const current = sessions.find((s) => s.isCurrent) ?? sessions[0];
    if (current && !academicSessionId) setAcademicSessionId(current.id);
  }, [sessions, academicSessionId]);

  const parsed = React.useMemo(() => {
    if (!text.trim()) return [];
    try {
      return parseCsv(text);
    } catch {
      return [];
    }
  }, [text]);

  const missingColumns = React.useMemo(() => {
    if (parsed.length === 0) return [];
    const present = Object.keys(parsed[0]);
    return ['firstName', 'lastName'].filter((column) => !present.includes(column));
  }, [parsed]);

  const submit = async () => {
    const rows = parsed
      .filter((row) => row.firstName && row.lastName)
      .map((row) => ({
        firstName: row.firstName,
        lastName: row.lastName,
        gender: (row.gender || 'UNDISCLOSED').toUpperCase(),
        dateOfBirth: row.dateOfBirth || null,
        guardianName: row.guardianName || null,
        guardianPhone: row.guardianPhone || null,
        guardianEmail: row.guardianEmail || null,
        classSectionId,
      }));

    if (rows.length === 0) {
      toast.error('No usable rows found. Each row needs a first and last name.');
      return;
    }

    const output = await run(
      () =>
        api.patch<{
          imported: number;
          failed: number;
          results: Array<{ row: number; admissionNo?: string; error?: string }>;
        }>('/api/admin/students', { academicSessionId, rows }),
      { success: 'Import finished.' },
    );

    if (output) {
      setResult(output);
      onImported();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import students from CSV"
      description="Paste the file contents or choose a file. Rows are validated individually."
      size="lg"
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Close
          </Button>
          <Button
            onClick={submit}
            loading={pending}
            disabled={!classSectionId || !academicSessionId || parsed.length === 0}
          >
            <FileSpreadsheet />
            Import {parsed.length > 0 ? `${parsed.length} row${parsed.length === 1 ? '' : 's'}` : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Target class" htmlFor="import-class" required>
            <Select
              id="import-class"
              value={classSectionId}
              onChange={(e) => setClassSectionId(e.target.value)}
            >
              <option value="">Choose a class…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.course.name} ({c._count.enrollments}/{c.capacity})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Academic session" htmlFor="import-session" required>
            <Select
              id="import-session"
              value={academicSessionId}
              onChange={(e) => setAcademicSessionId(e.target.value)}
            >
              <option value="">Choose a session…</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="CSV file"
          htmlFor="import-file"
          hint="Required columns: firstName, lastName. Optional: gender, dateOfBirth (YYYY-MM-DD), guardianName, guardianPhone, guardianEmail."
        >
          <Input
            id="import-file"
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setText(await file.text());
            }}
          />
        </Field>

        <Field label="Or paste the contents" htmlFor="import-text">
          <Textarea
            id="import-text"
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`${IMPORT_HEADERS.join(',')}\nAyesha,Khan,FEMALE,2012-04-18,Imran Khan,03001234567,imran@example.com`}
            className="font-mono text-xs"
          />
        </Field>

        {missingColumns.length > 0 && (
          <Alert tone="danger" title="The file is missing required columns">
            Add {missingColumns.join(' and ')} to the header row.
          </Alert>
        )}

        {parsed.length > 0 && missingColumns.length === 0 && (
          <div className="rounded-lg border border-[var(--line)]">
            <div className="flex items-center gap-2 border-b border-[var(--line)] bg-[var(--surface-sunken)] px-3.5 py-2 text-xs font-medium text-[var(--ink-muted)]">
              <Filter className="size-3.5" />
              Preview — first {Math.min(parsed.length, 5)} of {parsed.length} rows
            </div>
            <TableWrap>
              <thead>
                <tr>
                  {IMPORT_HEADERS.map((header) => (
                    <Th key={header}>{header}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.slice(0, 5).map((row, index) => (
                  <Tr key={index}>
                    {IMPORT_HEADERS.map((header) => (
                      <Td key={header} className="text-xs">
                        {row[header] ?? ''}
                      </Td>
                    ))}
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        )}

        {result && (
          <Alert
            tone={result.failed > 0 ? 'warning' : 'success'}
            title={`${result.imported} imported, ${result.failed} failed`}
          >
            {result.failed > 0 && (
              <ul className="mt-2 space-y-1 text-xs">
                {result.results
                  .filter((r) => r.error)
                  .slice(0, 10)
                  .map((r) => (
                    <li key={r.row}>
                      Row {r.row}: {r.error}
                    </li>
                  ))}
              </ul>
            )}
          </Alert>
        )}
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------------------
   Student detail
   -------------------------------------------------------------------------- */

function StudentDetailDrawer({
  student,
  onClose,
  onChanged,
  run,
  pending,
}: {
  student: StudentRow | null;
  onClose: () => void;
  onChanged: () => void;
  run: ReturnType<typeof useMutation>['run'];
  pending: boolean;
}) {
  const [statusOpen, setStatusOpen] = React.useState(false);
  const [targetStatus, setTargetStatus] = React.useState('INACTIVE');
  const [reason, setReason] = React.useState('');

  const [transferOpen, setTransferOpen] = React.useState(false);
  const [transferClassId, setTransferClassId] = React.useState('');
  const [transferReason, setTransferReason] = React.useState('');
  const [classes, setClasses] = React.useState<ClassOption[]>([]);

  React.useEffect(() => {
    if (!transferOpen) return;
    api
      .getOne<OptionsPayload>('/api/admin/students', { scope: 'options' })
      .then((data) => setClasses(data.classes))
      .catch(() => undefined);
  }, [transferOpen]);

  if (!student) return null;

  const enrollment = student.enrollments[0];

  const changeStatus = async () => {
    const result = await run(
      () =>
        api.put('/api/admin/students', {
          action: 'status',
          studentId: student.id,
          toStatus: targetStatus,
          reason: reason.trim() || 'Status changed by administrator',
        }),
      { success: 'Status updated.' },
    );

    if (result) {
      setStatusOpen(false);
      onChanged();
    }
  };

  const transfer = async () => {
    const result = await run(
      () =>
        api.put('/api/admin/students', {
          action: 'transfer',
          studentId: student.id,
          toClassSectionId: transferClassId,
          academicSessionId: enrollment?.academicSession.id ?? '',
          reason: transferReason.trim() || 'Class transfer',
        }),
      { success: 'Student transferred.' },
    );

    if (result) {
      setTransferOpen(false);
      onChanged();
    }
  };

  return (
    <>
      <Modal
        open={Boolean(student)}
        onClose={onClose}
        title={`${student.firstName} ${student.lastName}`}
        description={`Admission number ${student.admissionNo}`}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Link href={`/admin/students/${student.id}`}>
              <Button variant="secondary">Full profile</Button>
            </Link>
            <Button
              variant="outline"
              onClick={() => setTransferOpen(true)}
              disabled={!enrollment}
            >
              Transfer class
            </Button>
            <Button variant="dangerSoft" onClick={() => setStatusOpen(true)}>
              Change status
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ['Status', titleCase(student.status)],
              ['Gender', titleCase(student.gender)],
              ['Date of birth', student.dateOfBirth ? formatDate(student.dateOfBirth) : '—'],
              ['Admitted', formatDate(student.admissionDate)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-[var(--ink-subtle)]">{label}</dt>
                <dd className="mt-0.5 text-sm font-medium text-[var(--ink)]">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="rounded-lg border border-[var(--line)]">
            <h3 className="border-b border-[var(--line)] bg-[var(--surface-sunken)] px-3.5 py-2 text-xs font-semibold tracking-wide text-[var(--ink-muted)] uppercase">
              Current placement
            </h3>
            <div className="px-3.5 py-3 text-sm">
              {enrollment ? (
                <p className="text-[var(--ink)]">
                  {enrollment.classSection.name} · {enrollment.classSection.course.name}
                  {enrollment.batch ? ` · ${enrollment.batch.name}` : ''} ·{' '}
                  {enrollment.academicSession.name}
                </p>
              ) : (
                <p className="text-[var(--ink-subtle)]">Not currently enrolled in a class.</p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-[var(--line)]">
            <h3 className="border-b border-[var(--line)] bg-[var(--surface-sunken)] px-3.5 py-2 text-xs font-semibold tracking-wide text-[var(--ink-muted)] uppercase">
              Guardians ({student.guardians.length})
            </h3>
            <ul className="divide-y divide-[var(--line)]">
              {student.guardians.map((guardian) => (
                <li key={guardian.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-[var(--ink)]">
                      {guardian.guardianUser.name}
                      {guardian.isPrimary && (
                        <Badge tone="brand" className="ml-2">
                          Primary
                        </Badge>
                      )}
                    </p>
                    <p className="truncate text-xs text-[var(--ink-subtle)]">
                      {titleCase(guardian.relation)} ·{' '}
                      {guardian.contactPhone ?? guardian.guardianUser.phone ?? guardian.guardianUser.email}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {guardian.canViewFees && <Badge tone="brand">Fees</Badge>}
                    {guardian.canViewResults && <Badge tone="brand">Results</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Modal>

      <Modal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        title="Change student status"
        description="This is recorded in the student's status history."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setStatusOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={changeStatus} loading={pending}>
              Confirm change
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="New status" htmlFor="targetStatus" required>
            <Select
              id="targetStatus"
              value={targetStatus}
              onChange={(e) => setTargetStatus(e.target.value)}
            >
              {['ACTIVE', 'INACTIVE', 'TRANSFERRED', 'GRADUATED', 'WITHDRAWN'].map((value) => (
                <option key={value} value={value}>
                  {titleCase(value)}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Reason"
            htmlFor="statusReason"
            hint="Withdrawing, transferring or graduating also closes the active enrolment."
          >
            <Textarea
              id="statusReason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Family relocated to another city"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title="Transfer to another class"
        description="The current enrolment is closed and a new one is opened in the same session."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setTransferOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={transfer} loading={pending} disabled={!transferClassId}>
              Transfer
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Target class" htmlFor="transferClass" required>
            <Select
              id="transferClass"
              value={transferClassId}
              onChange={(e) => setTransferClassId(e.target.value)}
            >
              <option value="">Choose a class…</option>
              {classes
                .filter((c) => c.id !== enrollment?.classSection.id)
                .map((c) => (
                  <option key={c.id} value={c.id} disabled={c._count.enrollments >= c.capacity}>
                    {c.name} — {c.course.name} ({c._count.enrollments}/{c.capacity})
                    {c._count.enrollments >= c.capacity ? ' — full' : ''}
                  </option>
                ))}
            </Select>
          </Field>

          <Field label="Reason" htmlFor="transferReason">
            <Textarea
              id="transferReason"
              rows={3}
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}

export { Download, RefreshCw, Users, EmptyState };
