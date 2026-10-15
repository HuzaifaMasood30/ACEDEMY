'use client';

import * as React from 'react';
import { HeartHandshake, Link2, Plus, RefreshCw, UserX, Users } from 'lucide-react';
import { Alert, Badge, Button, Checkbox, Field, Input, Select } from '@/components/ui/primitives';
import { Card, CardHeader, EmptyState, PageHeader, StatCard, TableWrap, Td, Th, Tr } from '@/components/ui/structure';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Modal, ConfirmDialog } from '@/components/ui/overlays';
import { api } from '@/lib/client-api';
import { useMutation, useResource } from '@/lib/use-resource';
import { formatDate, formatNumber, titleCase } from '@/lib/format';

interface LinkRow {
  id: string;
  relation: string;
  isPrimary: boolean;
  isAuthorized: boolean;
  canViewFees: boolean;
  canViewResults: boolean;
  student: { id: string; admissionNo: string; firstName: string; lastName: string };
}

interface ParentRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  guardianLinks: LinkRow[];
}

const RELATIONS = ['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER'];

export function ParentsClient() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [detailId, setDetailId] = React.useState<string | null>(null);

  const { run, pending } = useMutation();

  const resource = useResource<ParentRow>('/api/admin/parents', {
    params: { page, pageSize: 20, q: search },
    debounceMs: 250,
  });

  const columns: Column<ParentRow>[] = [
    {
      key: 'name',
      header: 'Guardian',
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
          <span className="block truncate text-[0.6875rem] text-[var(--ink-subtle)]">
            {row.email}
          </span>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      hideBelow: 'md',
      cell: (row) => (
        <span className="tabular text-sm text-[var(--ink-muted)]">{row.phone ?? '—'}</span>
      ),
    },
    {
      key: 'children',
      header: 'Children',
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.guardianLinks.length === 0 ? (
            <span className="text-xs text-[var(--ink-subtle)]">None linked</span>
          ) : (
            row.guardianLinks.map((link) => (
              <Badge key={link.id} tone={link.isPrimary ? 'brand' : 'neutral'}>
                {link.student.firstName} {link.student.lastName.charAt(0)}.
              </Badge>
            ))
          )}
        </div>
      ),
    },
    {
      key: 'access',
      header: 'Access',
      hideBelow: 'lg',
      cell: (row) => {
        const links = row.guardianLinks;
        if (links.length === 0) return <span className="text-xs text-[var(--ink-subtle)]">—</span>;
        return (
          <div className="flex gap-1">
            {links.some((l) => l.canViewFees) && <Badge tone="brand">Fees</Badge>}
            {links.some((l) => l.canViewResults) && <Badge tone="brand">Results</Badge>}
          </div>
        );
      },
    },
    {
      key: 'lastLogin',
      header: 'Last sign-in',
      align: 'right',
      hideBelow: 'md',
      cell: (row) => (
        <span className="tabular text-xs text-[var(--ink-muted)]">
          {row.lastLoginAt ? formatDate(row.lastLoginAt) : 'Never'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <Badge tone={row.status === 'ACTIVE' ? 'success' : 'warning'}>
          {titleCase(row.status)}
        </Badge>
      ),
    },
  ];

  const totalLinks = resource.rows.reduce((sum, r) => sum + r.guardianLinks.length, 0);
  const noChildren = resource.rows.filter((r) => r.guardianLinks.length === 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parents and guardians"
        description="Guardian accounts, the children linked to them and what each may see."
        breadcrumbs={[{ label: 'People' }, { label: 'Parents' }]}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            Add guardian
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Guardian accounts"
          value={formatNumber(resource.meta?.total ?? 0)}
          icon={<HeartHandshake />}
          tone="brand"
        />
        <StatCard label="Child links" value={formatNumber(totalLinks)} icon={<Link2 />} tone="info" />
        <StatCard
          label="Without a child"
          value={formatNumber(noChildren)}
          icon={<UserX />}
          tone={noChildren > 0 ? 'warning' : 'success'}
          hint="Cannot use the parent portal until linked"
        />
        <StatCard label="Relations" value={String(RELATIONS.length)} icon={<Users />} tone="accent" />
      </div>

      {resource.error && (
        <Alert tone="danger" title="Could not load guardians">
          {resource.error}
        </Alert>
      )}

      <DataTable<ParentRow>
        columns={columns}
        rows={resource.rows}
        rowKey={(row) => row.id}
        loading={resource.loading}
        searchable
        searchPlaceholder="Search by name, email or phone…"
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
        emptyTitle="No guardian accounts"
        emptyDescription="Guardian accounts are created automatically when a student is admitted with a guardian email."
        toolbarExtra={
          <Button variant="outline" size="sm" onClick={resource.reload} loading={resource.refreshing}>
            <RefreshCw />
            Refresh
          </Button>
        }
      />

      <CreateGuardianModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        pending={pending}
        onSubmit={async (payload) => {
          const result = await run(() => api.post('/api/admin/parents', payload), {
            success: 'Guardian account created.',
          });
          if (result) {
            setCreateOpen(false);
            resource.reload();
          }
        }}
      />

      <GuardianDetailModal
        open={Boolean(detailId)}
        guardianId={detailId}
        onClose={() => setDetailId(null)}
        pending={pending}
        run={run}
        onChanged={resource.reload}
      />
    </div>
  );
}

function CreateGuardianModal({
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
  const [form, setForm] = React.useState({ name: '', email: '', phone: '', initialPassword: '' });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a guardian account"
      description="Link the account to a child from the guardian list once it exists."
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
                action: 'create',
                name: form.name.trim(),
                email: form.email.trim().toLowerCase(),
                phone: form.phone.trim() || null,
                initialPassword: form.initialPassword || null,
              });
            }}
          >
            Create account
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="p-name" required error={errors.name}>
          <Input
            id="p-name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
        </Field>

        <Field label="Email" htmlFor="p-email" required error={errors.email}>
          <Input
            id="p-email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
          />
        </Field>

        <Field label="Phone" htmlFor="p-phone">
          <Input
            id="p-phone"
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
          />
        </Field>

        <Field label="Initial password" htmlFor="p-password" hint="Leave blank to generate one.">
          <Input
            id="p-password"
            value={form.initialPassword}
            onChange={(e) => setForm((p) => ({ ...p, initialPassword: e.target.value }))}
          />
        </Field>
      </div>
    </Modal>
  );
}

interface GuardianDetail {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  guardianLinks: Array<{
    id: string;
    relation: string;
    isPrimary: boolean;
    isAuthorized: boolean;
    canViewFees: boolean;
    canViewResults: boolean;
    receivesNotifications: boolean;
    contactPhone: string | null;
    occupation: string | null;
    student: {
      id: string;
      admissionNo: string;
      firstName: string;
      lastName: string;
      status: string;
      enrollments: Array<{ classSection: { id: string; name: string } }>;
    };
  }>;
}

function GuardianDetailModal({
  open,
  guardianId,
  onClose,
  pending,
  run,
  onChanged,
}: {
  open: boolean;
  guardianId: string | null;
  onClose: () => void;
  pending: boolean;
  run: ReturnType<typeof useMutation>['run'];
  onChanged: () => void;
}) {
  const [guardian, setGuardian] = React.useState<GuardianDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [unlinkTarget, setUnlinkTarget] = React.useState<LinkRow | null>(null);

  const load = React.useCallback(async () => {
    if (!guardianId) return;
    setLoading(true);
    try {
      const data = await api.getOne<GuardianDetail>('/api/admin/parents', {
        scope: 'detail',
        id: guardianId,
      });
      setGuardian(data);
    } finally {
      setLoading(false);
    }
  }, [guardianId]);

  React.useEffect(() => {
    if (open) void load();
    else setGuardian(null);
  }, [open, load]);

  const updateLink = async (linkId: string, values: Record<string, unknown>) => {
    const result = await run(
      () => api.put('/api/admin/parents', { action: 'updateLink', linkId, values }),
      { success: 'Permissions updated.' },
    );
    if (result) {
      await load();
      onChanged();
    }
  };

  const unlink = async () => {
    if (!unlinkTarget) return;
    const result = await run(
      () => api.put('/api/admin/parents', { action: 'unlink', linkId: unlinkTarget.id }),
      { success: 'Child unlinked.' },
    );
    if (result) {
      setUnlinkTarget(null);
      await load();
      onChanged();
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={guardian ? guardian.name : 'Loading…'}
        description={guardian ? guardian.email : undefined}
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button onClick={() => setLinkOpen(true)} disabled={!guardian}>
              <Link2 />
              Link a child
            </Button>
          </>
        }
      >
        {loading || !guardian ? (
          <div className="py-10 text-center text-sm text-[var(--ink-muted)]">Loading…</div>
        ) : (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ['Status', titleCase(guardian.status)],
                ['Phone', guardian.phone ?? '—'],
                ['Created', formatDate(guardian.createdAt)],
                ['Last sign-in', guardian.lastLoginAt ? formatDate(guardian.lastLoginAt) : 'Never'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-[var(--ink-subtle)]">{label}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-[var(--ink)]">{value}</dd>
                </div>
              ))}
            </dl>

            {guardian.guardianLinks.length === 0 ? (
              <EmptyState
                icon={<Link2 />}
                title="No children linked"
                description="This guardian cannot sign in to the parent portal until a child is linked."
                className="border-0"
              />
            ) : (
              guardian.guardianLinks.map((link) => (
                <Card key={link.id}>
                  <CardHeader
                    title={`${link.student.firstName} ${link.student.lastName}`}
                    description={`${link.student.admissionNo} · ${titleCase(link.relation)}${
                      link.student.enrollments[0]
                        ? ` · ${link.student.enrollments[0].classSection.name}`
                        : ''
                    }`}
                    icon={<HeartHandshake />}
                    action={
                      <Button variant="ghost" size="sm" onClick={() => setUnlinkTarget(link as LinkRow)}>
                        Unlink
                      </Button>
                    }
                  />

                  <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                    {(
                      [
                        ['isPrimary', 'Primary contact'],
                        ['isAuthorized', 'Authorised'],
                        ['canViewFees', 'Can view fees'],
                        ['canViewResults', 'Can view results'],
                        ['receivesNotifications', 'Receives alerts'],
                      ] as const
                    ).map(([key, label]) => (
                      <label
                        key={key}
                        className="flex items-center gap-2.5 rounded-md border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
                      >
                        <Checkbox
                          checked={link[key]}
                          disabled={pending}
                          onChange={(e) => updateLink(link.id, { [key]: e.target.checked })}
                        />
                        {label}
                      </label>
                    ))}
                  </div>

                  {!link.isAuthorized && (
                    <div className="px-4 pb-4">
                      <Alert tone="warning">
                        This link is not authorised, so the guardian cannot access this child’s
                        records at all.
                      </Alert>
                    </div>
                  )}
                </Card>
              ))
            )}
          </div>
        )}
      </Modal>

      <LinkChildModal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        guardianId={guardian?.id ?? null}
        pending={pending}
        onSubmit={async (payload) => {
          const result = await run(() => api.post('/api/admin/parents', payload), {
            success: 'Child linked.',
          });
          if (result) {
            setLinkOpen(false);
            await load();
            onChanged();
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(unlinkTarget)}
        onClose={() => setUnlinkTarget(null)}
        onConfirm={unlink}
        loading={pending}
        title="Unlink this child?"
        message={
          unlinkTarget
            ? `${unlinkTarget.student.firstName} ${unlinkTarget.student.lastName} will no longer appear in this guardian's portal. If this is their only child, the account is suspended.`
            : ''
        }
        confirmLabel="Unlink"
      />
    </>
  );
}

interface StudentOption {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  status: string;
}

function LinkChildModal({
  open,
  onClose,
  guardianId,
  pending,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  guardianId: string | null;
  pending: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [search, setSearch] = React.useState('');
  const [students, setStudents] = React.useState<StudentOption[]>([]);
  const [selected, setSelected] = React.useState<StudentOption | null>(null);
  const [form, setForm] = React.useState({
    relation: 'GUARDIAN',
    isPrimary: false,
    canViewFees: true,
    canViewResults: true,
    receivesNotifications: true,
    contactPhone: '',
    occupation: '',
  });

  React.useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      api
        .getOne<{ rows: StudentOption[] }>('/api/admin/students', {
          pageSize: 30,
          q: search,
          status: 'ACTIVE',
        })
        .then((data) => setStudents(data.rows ?? []))
        .catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, search]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Link a child"
      description="Search for the student and set what this guardian may see."
      size="lg"
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            loading={pending}
            disabled={!selected || !guardianId}
            onClick={async () => {
              if (!selected || !guardianId) return;
              await onSubmit({
                action: 'link',
                guardianUserId: guardianId,
                studentId: selected.id,
                relation: form.relation,
                isPrimary: form.isPrimary,
                canViewFees: form.canViewFees,
                canViewResults: form.canViewResults,
                receivesNotifications: form.receivesNotifications,
                contactPhone: form.contactPhone || null,
                occupation: form.occupation || null,
              });
            }}
          >
            Link child
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Find a student" htmlFor="link-search">
          <Input
            id="link-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or admission number…"
          />
        </Field>

        <div className="scrollbar-slim max-h-52 overflow-y-auto rounded-md border border-[var(--line)]">
          {students.length === 0 ? (
            <p className="p-4 text-sm text-[var(--ink-subtle)]">No active students matched.</p>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {students.map((student) => (
                <li key={student.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(student)}
                    className={
                      selected?.id === student.id
                        ? 'flex w-full items-center justify-between bg-[var(--brand-soft)] px-3.5 py-2.5 text-left'
                        : 'flex w-full items-center justify-between px-3.5 py-2.5 text-left hover:bg-[var(--surface-hover)]'
                    }
                  >
                    <span className="text-sm text-[var(--ink)]">
                      {student.firstName} {student.lastName}
                    </span>
                    <span className="tabular text-xs text-[var(--ink-subtle)]">
                      {student.admissionNo}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Relation" htmlFor="link-relation">
                <Select
                  id="link-relation"
                  value={form.relation}
                  onChange={(e) => setForm((p) => ({ ...p, relation: e.target.value }))}
                >
                  {RELATIONS.map((value) => (
                    <option key={value} value={value}>
                      {titleCase(value)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Contact phone" htmlFor="link-phone">
                <Input
                  id="link-phone"
                  value={form.contactPhone}
                  onChange={(e) => setForm((p) => ({ ...p, contactPhone: e.target.value }))}
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ['isPrimary', 'Primary contact'],
                  ['canViewFees', 'Can view fees'],
                  ['canViewResults', 'Can view results'],
                  ['receivesNotifications', 'Receives WhatsApp alerts'],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-2.5 rounded-md border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)]"
                >
                  <Checkbox
                    checked={form[key]}
                    onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.checked }))}
                  />
                  {label}
                </label>
              ))}
            </div>
          </>
        )}

        {!selected && students.length > 0 && (
          <Alert tone="info">Select a student above to set the link permissions.</Alert>
        )}
      </div>
    </Modal>
  );
}

export { TableWrap, Td, Th, Tr, formatDate };
