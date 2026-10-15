'use client';

import * as React from 'react';
import { KeyRound, Lock, Plus, RefreshCw, ShieldCheck, UserCog } from 'lucide-react';
import { Alert, Badge, Button, Field, Input, Select } from '@/components/ui/primitives';
import { Card, CardHeader, EmptyState, PageHeader, StatCard } from '@/components/ui/structure';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Modal, ConfirmDialog, Tabs } from '@/components/ui/overlays';
import { api } from '@/lib/client-api';
import { useMutation, useResource } from '@/lib/use-resource';
import { formatDateTime, formatNumber, titleCase } from '@/lib/format';

interface UserRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  failedLogins: number;
  lockedUntil: string | null;
  createdAt: string;
  _count: { sessions: number; permissionGrants: number };
}

interface GrantRow {
  id: string;
  userId: string;
  action: string;
  resource: string;
  scopeType: string | null;
  scopeId: string | null;
  expiresAt: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string; role: string };
}

interface PermissionsPayload {
  catalog: Array<{ key: string; value: string; area: string }>;
  grants: GrantRow[];
}

const ROLE_TONE: Record<string, 'danger' | 'info' | 'success' | 'brand'> = {
  ADMIN: 'danger',
  TEACHER: 'info',
  STUDENT: 'success',
  PARENT: 'brand',
};

export function UsersClient() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [role, setRole] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [tab, setTab] = React.useState<'accounts' | 'grants'>('accounts');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [resetTarget, setResetTarget] = React.useState<UserRow | null>(null);
  const [statusTarget, setStatusTarget] = React.useState<UserRow | null>(null);
  const [pendingStatus, setPendingStatus] = React.useState('ACTIVE');
  const [newPassword, setNewPassword] = React.useState('');
  const [permissions, setPermissions] = React.useState<PermissionsPayload | null>(null);

  const { run, pending } = useMutation();

  const resource = useResource<UserRow>('/api/admin/users', {
    params: { page, pageSize: 20, q: search, role, status },
    debounceMs: 250,
  });

  const loadPermissions = React.useCallback(() => {
    api
      .getOne<PermissionsPayload>('/api/admin/users', { scope: 'permissions' })
      .then(setPermissions)
      .catch(() => undefined);
  }, []);

  React.useEffect(() => {
    if (tab === 'grants') loadPermissions();
  }, [tab, loadPermissions]);

  const setUserStatus = async () => {
    if (!statusTarget) return;
    const result = await run(
      () =>
        api.put('/api/admin/users', {
          action: 'setStatus',
          userId: statusTarget.id,
          status: pendingStatus,
        }),
      { success: `Account set to ${pendingStatus.toLowerCase()}.` },
    );
    if (result) {
      setStatusTarget(null);
      resource.reload();
    }
  };

  const resetPassword = async () => {
    if (!resetTarget) return;
    const result = await run(
      () =>
        api.put('/api/admin/users', {
          action: 'resetPassword',
          userId: resetTarget.id,
          newPassword,
        }),
      { success: 'Password reset. Existing sessions were signed out.' },
    );
    if (result) {
      setResetTarget(null);
      setNewPassword('');
      resource.reload();
    }
  };

  const unlock = async (row: UserRow) => {
    const result = await run(
      () => api.put('/api/admin/users', { action: 'unlock', userId: row.id }),
      { success: 'Account unlocked.' },
    );
    if (result) resource.reload();
  };

  const columns: Column<UserRow>[] = [
    {
      key: 'name',
      header: 'Account',
      sortable: true,
      cell: (row) => (
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium text-[var(--ink)]">{row.name}</span>
          <span className="block truncate text-[0.6875rem] text-[var(--ink-subtle)]">
            {row.email}
          </span>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      cell: (row) => <Badge tone={ROLE_TONE[row.role] ?? 'neutral'}>{titleCase(row.role)}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => {
        const locked = row.lockedUntil && new Date(row.lockedUntil) > new Date();
        if (locked) return <Badge tone="danger">Locked out</Badge>;
        return (
          <Badge
            tone={
              row.status === 'ACTIVE'
                ? 'success'
                : row.status === 'SUSPENDED'
                  ? 'danger'
                  : 'warning'
            }
          >
            {titleCase(row.status)}
          </Badge>
        );
      },
    },
    {
      key: 'security',
      header: 'Security',
      hideBelow: 'lg',
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.mfaEnabled && (
            <Badge tone="success">
              <ShieldCheck className="size-3" />
              MFA
            </Badge>
          )}
          {row._count.permissionGrants > 0 && (
            <Badge tone="brand">+{row._count.permissionGrants} grant(s)</Badge>
          )}
          {row.failedLogins > 0 && <Badge tone="warning">{row.failedLogins} failed</Badge>}
          {!row.mfaEnabled && row._count.permissionGrants === 0 && row.failedLogins === 0 && (
            <span className="text-xs text-[var(--ink-subtle)]">—</span>
          )}
        </div>
      ),
    },
    {
      key: 'sessions',
      header: 'Sessions',
      align: 'right',
      hideBelow: 'md',
      cell: (row) => <span className="tabular text-sm">{row._count.sessions}</span>,
    },
    {
      key: 'lastLogin',
      header: 'Last sign-in',
      align: 'right',
      hideBelow: 'md',
      cell: (row) => (
        <span className="tabular text-xs text-[var(--ink-muted)]">
          {row.lastLoginAt ? formatDateTime(row.lastLoginAt) : 'Never'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => {
        const locked = row.lockedUntil && new Date(row.lockedUntil) > new Date();
        return (
          <div className="flex justify-end gap-1">
            {locked && (
              <Button variant="ghost" size="sm" onClick={() => unlock(row)}>
                <Lock />
                Unlock
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setResetTarget(row)}>
              <KeyRound />
              Password
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setStatusTarget(row)}>
              <UserCog />
              Status
            </Button>
          </div>
        );
      },
    },
  ];

  const grantColumns: Column<GrantRow>[] = [
    {
      key: 'user',
      header: 'Account',
      cell: (row) => (
        <div className="min-w-0">
          <span className="block truncate text-sm text-[var(--ink)]">{row.user.name}</span>
          <span className="block truncate text-[0.6875rem] text-[var(--ink-subtle)]">
            {row.user.email}
          </span>
        </div>
      ),
    },
    {
      key: 'permission',
      header: 'Permission',
      cell: (row) => (
        <Badge tone="brand">
          {row.resource}:{row.action.toLowerCase()}
        </Badge>
      ),
    },
    {
      key: 'scope',
      header: 'Scope',
      hideBelow: 'md',
      cell: (row) => (
        <span className="text-xs text-[var(--ink-muted)]">
          {row.scopeType ? `${row.scopeType}${row.scopeId ? `: ${row.scopeId}` : ''}` : 'Global'}
        </span>
      ),
    },
    {
      key: 'expiresAt',
      header: 'Expires',
      align: 'right',
      cell: (row) => (
        <span className="tabular text-xs text-[var(--ink-muted)]">
          {row.expiresAt ? formatDateTime(row.expiresAt) : 'Never'}
        </span>
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
          onClick={async () => {
            const result = await run(
              () => api.put('/api/admin/users', { action: 'revoke', grantId: row.id }),
              { success: 'Permission revoked.' },
            );
            if (result) loadPermissions();
          }}
        >
          Revoke
        </Button>
      ),
    },
  ];

  const admins = resource.rows.filter((r) => r.role === 'ADMIN').length;
  const suspended = resource.rows.filter((r) => r.status === 'SUSPENDED').length;
  const locked = resource.rows.filter(
    (r) => r.lockedUntil && new Date(r.lockedUntil) > new Date(),
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="User accounts"
        description="Portal logins, account status and additional permissions."
        breadcrumbs={[{ label: 'People' }, { label: 'User accounts' }]}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New admin account
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Accounts" value={formatNumber(resource.meta?.total ?? 0)} icon={<KeyRound />} tone="brand" />
        <StatCard label="Administrators" value={formatNumber(admins)} icon={<ShieldCheck />} tone="danger" />
        <StatCard
          label="Suspended"
          value={formatNumber(suspended)}
          icon={<UserCog />}
          tone={suspended > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Locked out"
          value={formatNumber(locked)}
          icon={<Lock />}
          tone={locked > 0 ? 'danger' : 'success'}
          hint="Too many failed sign-in attempts"
        />
      </div>

      {resource.error && (
        <Alert tone="danger" title="Could not load accounts">
          {resource.error}
        </Alert>
      )}

      <Tabs
        value={tab}
        onChange={(value) => setTab(value as typeof tab)}
        tabs={[
          { value: 'accounts', label: 'Accounts' },
          { value: 'grants', label: 'Extra permissions' },
        ]}
      />

      {tab === 'accounts' ? (
        <DataTable<UserRow>
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
          filters={[
            {
              key: 'role',
              label: 'Role',
              options: [
                { value: 'ADMIN', label: 'Administrator' },
                { value: 'TEACHER', label: 'Teacher' },
                { value: 'STUDENT', label: 'Student' },
                { value: 'PARENT', label: 'Parent' },
              ],
            },
            {
              key: 'status',
              label: 'Status',
              options: [
                { value: 'ACTIVE', label: 'Active' },
                { value: 'INACTIVE', label: 'Inactive' },
                { value: 'SUSPENDED', label: 'Suspended' },
                { value: 'PENDING_VERIFICATION', label: 'Pending verification' },
              ],
            },
          ]}
          filterValues={{ role, status }}
          onFilterChange={(key, value) => {
            if (key === 'role') setRole(value);
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
          emptyTitle="No accounts found"
          emptyDescription="Adjust the filters, or create an administrative account."
          toolbarExtra={
            <Button variant="outline" size="sm" onClick={resource.reload} loading={resource.refreshing}>
              <RefreshCw />
              Refresh
            </Button>
          }
        />
      ) : (
        <Card>
          <CardHeader
            title="Additional permission grants"
            description="These widen a role's default permissions for one account, optionally until a set date."
            icon={<ShieldCheck />}
            action={
              <Button variant="outline" size="sm" onClick={loadPermissions}>
                <RefreshCw />
                Refresh
              </Button>
            }
          />
          {!permissions || permissions.grants.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck />}
              title="No extra grants"
              description="Every account is running on its role's default permissions."
              className="border-0"
            />
          ) : (
            <DataTable<GrantRow>
              columns={grantColumns}
              rows={permissions.grants}
              rowKey={(row) => row.id}
            />
          )}
        </Card>
      )}

      <CreateAdminModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        pending={pending}
        onSubmit={async (payload) => {
          const result = await run(() => api.post('/api/admin/users', payload), {
            success: 'Account created.',
          });
          if (result) {
            setCreateOpen(false);
            resource.reload();
          }
        }}
      />

      <Modal
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title="Reset password"
        description={
          resetTarget
            ? `Set a new password for ${resetTarget.name}. Every session is signed out immediately.`
            : ''
        }
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setResetTarget(null)} disabled={pending}>
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
        <Field label="New password" htmlFor="user-new-password" required hint="At least 8 characters.">
          <Input
            id="user-new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </Field>
      </Modal>

      <Modal
        open={Boolean(statusTarget)}
        onClose={() => setStatusTarget(null)}
        title="Change account status"
        description={statusTarget ? statusTarget.email : ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setStatusTarget(null)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={setUserStatus} loading={pending}>
              Apply
            </Button>
          </>
        }
      >
        <Field
          label="Status"
          htmlFor="user-status"
          hint="Any status other than active immediately signs the account out everywhere."
        >
          <Select
            id="user-status"
            value={pendingStatus}
            onChange={(e) => setPendingStatus(e.target.value)}
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="PENDING_VERIFICATION">Pending verification</option>
          </Select>
        </Field>
      </Modal>
    </div>
  );
}

function CreateAdminModal({
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
    email: '',
    phone: '',
    role: 'ADMIN',
    password: '',
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New administrative account"
      description="Teacher and student logins are created from their own screens so the required profile exists."
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
                email: form.email.trim().toLowerCase(),
                phone: form.phone.trim() || null,
                role: form.role,
                password: form.password,
                status: 'ACTIVE',
              });
            }}
          >
            Create account
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="u-name" required error={errors.name}>
          <Input
            id="u-name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
        </Field>

        <Field label="Email" htmlFor="u-email" required error={errors.email}>
          <Input
            id="u-email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
          />
        </Field>

        <Field label="Phone" htmlFor="u-phone">
          <Input
            id="u-phone"
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
          />
        </Field>

        <Field
          label="Role"
          htmlFor="u-role"
          required
          hint="Administrators have full access. Parent accounts are managed separately."
        >
          <Select
            id="u-role"
            value={form.role}
            onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
          >
            <option value="ADMIN">Administrator</option>
            <option value="PARENT">Parent</option>
          </Select>
        </Field>

        <Field
          label="Password"
          htmlFor="u-password"
          required
          className="sm:col-span-2"
          hint="At least 8 characters. Share it securely."
          error={errors.password}
        >
          <Input
            id="u-password"
            value={form.password}
            onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
          />
        </Field>
      </div>
    </Modal>
  );
}

export { ConfirmDialog, formatNumber };
