'use client';

import * as React from 'react';
import { Archive, Bell, Megaphone, Plus, RefreshCw, Send, Users } from 'lucide-react';
import { Alert, Badge, Button, Checkbox, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Card, EmptyState, PageHeader, StatCard } from '@/components/ui/structure';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Modal } from '@/components/ui/overlays';
import { api } from '@/lib/client-api';
import { useMutation, useResource } from '@/lib/use-resource';
import { formatDateTime, formatNumber, titleCase } from '@/lib/format';

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  audience: string;
  priority: string;
  status: string;
  publishAt: string;
  expiresAt: string | null;
  createdAt: string;
  author: { id: string; name: string };
  _count: { reads: number };
}

const AUDIENCES = ['ALL', 'STUDENTS', 'PARENTS', 'TEACHERS', 'APPLICANTS', 'CLASS'] as const;
const PRIORITIES = ['NORMAL', 'HIGH', 'URGENT'] as const;

const PRIORITY_TONE: Record<string, 'neutral' | 'info' | 'warning' | 'danger'> = {

  NORMAL: 'info',
  HIGH: 'warning',
  URGENT: 'danger',
};

const STATUS_TONE: Record<string, 'neutral' | 'warning' | 'success' | 'info'> = {
  DRAFT: 'neutral',
  SCHEDULED: 'warning',
  PUBLISHED: 'success',
  ARCHIVED: 'info',
};

export function AnnouncementsClient() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [audience, setAudience] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [classes, setClasses] = React.useState<Array<{ id: string; name: string }>>([]);
  const [form, setForm] = React.useState({
    title: '',
    body: '',
    audience: 'ALL',
    classSectionId: '',
    priority: 'NORMAL',
    publishAt: '',
    expiresAt: '',
    notify: false,
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const { run, pending } = useMutation();

  const resource = useResource<AnnouncementRow>('/api/admin/announcements', {
    params: { page, pageSize: 20, q: search, status, audience },
    debounceMs: 250,
  });

  React.useEffect(() => {
    if (!createOpen) return;
    api
      .getOne<{ rows: Array<{ id: string; name: string }> }>('/api/admin/classes', { pageSize: 200 })
      .then((data) => setClasses(data.rows ?? []))
      .catch(() => undefined);
  }, [createOpen]);

  const columns: Column<AnnouncementRow>[] = [
    {
      key: 'title',
      header: 'Announcement',
      sortable: true,
      cell: (row) => (
        <div className="min-w-0 max-w-md">
          <span className="block truncate text-sm font-medium text-[var(--ink)]">{row.title}</span>
          <span className="block truncate text-[0.6875rem] text-[var(--ink-subtle)]">
            {row.body}
          </span>
        </div>
      ),
    },
    {
      key: 'audience',
      header: 'Audience',
      cell: (row) => <Badge tone="brand">{titleCase(row.audience)}</Badge>,
    },
    {
      key: 'priority',
      header: 'Priority',
      hideBelow: 'md',
      cell: (row) => (
        <Badge tone={PRIORITY_TONE[row.priority] ?? 'neutral'}>{titleCase(row.priority)}</Badge>
      ),
    },
    {
      key: 'publishAt',
      header: 'Publish',
      hideBelow: 'lg',
      align: 'right',
      cell: (row) => (
        <span className="tabular text-xs text-[var(--ink-muted)]">
          {formatDateTime(row.publishAt)}
        </span>
      ),
    },
    {
      key: 'reads',
      header: 'Reads',
      align: 'right',
      hideBelow: 'md',
      cell: (row) => <span className="tabular text-sm">{row._count.reads}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <Badge tone={STATUS_TONE[row.status] ?? 'neutral'}>{titleCase(row.status)}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <div className="flex justify-end gap-1">
          {row.status !== 'PUBLISHED' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                const result = await run(
                  () =>
                    api.put('/api/admin/announcements', {
                      id: row.id,
                      status: 'PUBLISHED',
                      notify: true,
                    }),
                  { success: 'Published and notifications queued.' },
                );
                if (result) resource.reload();
              }}
            >
              <Send />
              Publish
            </Button>
          )}
          {row.status === 'PUBLISHED' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                const result = await run(
                  () => api.put('/api/admin/announcements', { id: row.id, status: 'ARCHIVED' }),
                  { success: 'Announcement archived.' },
                );
                if (result) resource.reload();
              }}
            >
              <Archive />
              Archive
            </Button>
          )}
        </div>
      ),
    },
  ];

  const published = resource.rows.filter((r) => r.status === 'PUBLISHED').length;
  const scheduled = resource.rows.filter((r) => r.status === 'SCHEDULED').length;
  const reads = resource.rows.reduce((sum, r) => sum + r._count.reads, 0);

  const submit = async () => {
    setErrors({});
    const result = await run(
      () =>
        api.post('/api/admin/announcements', {
          title: form.title.trim(),
          body: form.body.trim(),
          audience: form.audience,
          classSectionId: form.audience === 'CLASS' ? form.classSectionId : null,
          priority: form.priority,
          publishAt: form.publishAt ? new Date(`${form.publishAt}T09:00:00.000Z`).toISOString() : null,
          expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59.000Z`).toISOString() : null,
          notify: form.notify,
        }),
      { success: 'Announcement created.' },
    );

    if (result) {
      setCreateOpen(false);
      setForm({
        title: '',
        body: '',
        audience: 'ALL',
        classSectionId: '',
        priority: 'NORMAL',
        publishAt: '',
        expiresAt: '',
        notify: false,
      });
      resource.reload();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcements"
        description="Notices for the whole academy or a single class, with optional WhatsApp delivery."
        breadcrumbs={[{ label: 'Communication' }, { label: 'Announcements' }]}
        actions={
          <>
            <Button variant="outline" onClick={resource.reload} loading={resource.refreshing}>
              <RefreshCw />
              Refresh
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              New announcement
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Announcements"
          value={formatNumber(resource.meta?.total ?? 0)}
          icon={<Megaphone />}
          tone="brand"
        />
        <StatCard label="Published" value={formatNumber(published)} icon={<Bell />} tone="success" />
        <StatCard
          label="Scheduled"
          value={formatNumber(scheduled)}
          icon={<Send />}
          tone="warning"
        />
        <StatCard
          label="Total reads"
          value={formatNumber(reads)}
          icon={<Users />}
          tone="info"
          hint="On this page"
        />
      </div>

      {resource.error && (
        <Alert tone="danger" title="Could not load announcements">
          {resource.error}
        </Alert>
      )}

      <DataTable<AnnouncementRow>
        columns={columns}
        rows={resource.rows}
        rowKey={(row) => row.id}
        loading={resource.loading}
        searchable
        searchPlaceholder="Search announcements…"
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
              { value: 'PUBLISHED', label: 'Published' },
              { value: 'ARCHIVED', label: 'Archived' },
            ],
          },
          {
            key: 'audience',
            label: 'Audience',
            options: AUDIENCES.map((value) => ({ value, label: titleCase(value) })),
          },
        ]}
        filterValues={{ status, audience }}
        onFilterChange={(key, value) => {
          if (key === 'status') setStatus(value);
          if (key === 'audience') setAudience(value);
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
        emptyTitle="No announcements"
        emptyDescription="Create a notice to inform students, guardians or staff."
        emptyAction={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New announcement
          </Button>
        }
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New announcement"
        description="Leave the publish date blank to send immediately."
        size="lg"
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              loading={pending}
              disabled={!form.title.trim() || !form.body.trim()}
            >
              Create announcement
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Title" htmlFor="an-title" required error={errors.title}>
            <Input
              id="an-title"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="e.g. Parent-teacher meeting on Friday"
            />
          </Field>

          <Field label="Message" htmlFor="an-body" required error={errors.body}>
            <Textarea
              id="an-body"
              rows={5}
              value={form.body}
              onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Audience" htmlFor="an-audience" required>
              <Select
                id="an-audience"
                value={form.audience}
                onChange={(e) => setForm((p) => ({ ...p, audience: e.target.value }))}
              >
                {AUDIENCES.map((value) => (
                  <option key={value} value={value}>
                    {value === 'ALL' ? 'Everyone' : titleCase(value)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Priority" htmlFor="an-priority" required>
              <Select
                id="an-priority"
                value={form.priority}
                onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
              >
                {PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {titleCase(value)}
                  </option>
                ))}
              </Select>
            </Field>

            {form.audience === 'CLASS' && (
              <Field label="Class" htmlFor="an-class" required className="sm:col-span-2">
                <Select
                  id="an-class"
                  value={form.classSectionId}
                  onChange={(e) => setForm((p) => ({ ...p, classSectionId: e.target.value }))}
                >
                  <option value="">Choose a class…</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <Field label="Publish on" htmlFor="an-publish" hint="Blank publishes immediately.">
              <Input
                id="an-publish"
                type="date"
                value={form.publishAt}
                onChange={(e) => setForm((p) => ({ ...p, publishAt: e.target.value }))}
              />
            </Field>

            <Field label="Expires on" htmlFor="an-expires" hint="Optional.">
              <Input
                id="an-expires"
                type="date"
                min={form.publishAt || undefined}
                value={form.expiresAt}
                onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))}
              />
            </Field>
          </div>

          <label className="flex items-start gap-2.5 rounded-md border border-[var(--line)] px-3.5 py-3 text-sm text-[var(--ink)]">
            <Checkbox
              checked={form.notify}
              onChange={(e) => setForm((p) => ({ ...p, notify: e.target.checked }))}
              className="mt-0.5"
            />
            <span>
              Also send by WhatsApp
              <span className="mt-0.5 block text-xs text-[var(--ink-subtle)]">
                Queues one message per guardian who has opted in. Delivery is retried automatically if
                the provider is temporarily unavailable.
              </span>
            </span>
          </label>
        </div>
      </Modal>

      {resource.rows.length === 0 && !resource.loading && (
        <EmptyState
          icon={<Megaphone />}
          title="Nothing announced yet"
          description="Announcements appear on the public notices page and in each portal's notification feed."
          className="border-0"
        />
      )}
    </div>
  );
}
