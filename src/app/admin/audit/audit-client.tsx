'use client';

import * as React from 'react';
import { Download, RefreshCw, ScrollText, Terminal } from 'lucide-react';
import { Alert, Badge, Button, Select } from '@/components/ui/primitives';
import { Card, EmptyState, PageHeader } from '@/components/ui/structure';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Modal, Tabs } from '@/components/ui/overlays';
import { api } from '@/lib/client-api';
import { useResource } from '@/lib/use-resource';
import { formatDateTime, titleCase } from '@/lib/format';

interface AuditRow {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface EventRow {
  id: string;
  level: string;
  source: string | null;
  message: string;
  detail: unknown;
  createdAt: string;
}

const LEVEL_TONE: Record<string, 'danger' | 'warning' | 'info' | 'neutral' | 'success'> = {
  ERROR: 'danger',
  FATAL: 'danger',
  WARN: 'warning',
  WARNING: 'warning',
  INFO: 'info',
  DEBUG: 'neutral',
};

/** Actions that change money or access rights deserve a louder badge. */
const SENSITIVE = /(invoice|payment|fee|refund|adjust|settings|user|role|permission|auth|delete|suspend)/i;

export function AuditClient() {
  const [tab, setTab] = React.useState<'audit' | 'events'>('audit');
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [action, setAction] = React.useState('');
  const [level, setLevel] = React.useState('');
  const [detail, setDetail] = React.useState<AuditRow | null>(null);

  const audit = useResource<AuditRow>('/api/admin/audit', {
    params: { scope: 'audit', page, pageSize: 25, q: search, action },
    debounceMs: 250,
    enabled: tab === 'audit',
  });

  const events = useResource<EventRow>('/api/admin/audit', {
    params: { scope: 'events', page, pageSize: 25, level },
    enabled: tab === 'events',
  });

  // Distinct actions seen in the current page drive the filter, so it never
  // offers an action that cannot match.
  const actionOptions = React.useMemo(
    () => Array.from(new Set(audit.rows.map((r) => r.action))).sort(),
    [audit.rows],
  );

  const columns: Column<AuditRow>[] = [
    {
      key: 'createdAt',
      header: 'When',
      cell: (row) => (
        <span className="tabular whitespace-nowrap text-xs text-[var(--ink-muted)]">
          {formatDateTime(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Badge tone={SENSITIVE.test(row.action) ? 'warning' : 'neutral'}>{row.action}</Badge>
        </div>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      cell: (row) => (
        <div className="min-w-0">
          <span className="block truncate text-sm text-[var(--ink)]">
            {row.actorEmail ?? 'System'}
          </span>
          {row.actorRole && (
            <span className="block text-[0.6875rem] text-[var(--ink-subtle)]">
              {titleCase(row.actorRole)}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'entity',
      header: 'Entity',
      hideBelow: 'md',
      cell: (row) => (
        <span className="text-xs text-[var(--ink-muted)]">
          {row.entity ?? '—'}
          {row.entityId && (
            <span className="tabular block text-[0.6875rem] text-[var(--ink-subtle)]">
              {row.entityId.slice(0, 12)}…
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'ip',
      header: 'Source IP',
      align: 'right',
      hideBelow: 'xl',
      cell: (row) => (
        <span className="tabular text-xs text-[var(--ink-subtle)]">{row.ipAddress ?? '—'}</span>
      ),
    },
    {
      key: 'view',
      header: '',
      align: 'right',
      cell: (row) =>
        row.before || row.after ? (
          <Button variant="ghost" size="sm" onClick={() => setDetail(row)}>
            View
          </Button>
        ) : null,
    },
  ];

  const eventColumns: Column<EventRow>[] = [
    {
      key: 'createdAt',
      header: 'When',
      cell: (row) => (
        <span className="tabular whitespace-nowrap text-xs text-[var(--ink-muted)]">
          {formatDateTime(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'level',
      header: 'Level',
      cell: (row) => <Badge tone={LEVEL_TONE[row.level] ?? 'neutral'}>{row.level}</Badge>,
    },
    {
      key: 'source',
      header: 'Source',
      hideBelow: 'sm',
      cell: (row) => <span className="text-xs text-[var(--ink-muted)]">{row.source ?? '—'}</span>,
    },
    {
      key: 'message',
      header: 'Message',
      cell: (row) => (
        <span className="block max-w-[36rem] break-words text-sm text-[var(--ink)]">
          {row.message}
        </span>
      ),
    },
  ];

  const exportAudit = () => {
    window.location.href = api.exportUrl('/api/admin/audit', {
      scope: 'audit',
      q: search,
      action,
      format: 'csv',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Immutable record of who changed what. Entries are written by the actions themselves and cannot be edited here."
        breadcrumbs={[{ label: 'System' }, { label: 'Audit log' }]}
        actions={
          <Button variant="outline" onClick={exportAudit}>
            <Download />
            Export CSV
          </Button>
        }
      />

      <Tabs
        tabs={[
          { value: 'audit', label: 'Data changes' },
          { value: 'events', label: 'Operational events' },
        ]}
        value={tab}
        onChange={(value) => {
          setTab(value as 'audit' | 'events');
          setPage(1);
        }}
      />

      {audit.error && (
        <Alert tone="danger" title="Could not load the audit log">
          {audit.error}
        </Alert>
      )}
      {events.error && (
        <Alert tone="danger" title="Could not load operational events">
          {events.error}
        </Alert>
      )}

      {tab === 'audit' && (
        <DataTable<AuditRow>
          columns={columns}
          rows={audit.rows}
          rowKey={(row) => row.id}
          loading={audit.loading}
          searchable
          searchPlaceholder="Search by actor email, action or entity…"
          searchValue={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          filters={
            actionOptions.length
              ? [
                  {
                    key: 'action',
                    label: 'Action',
                    options: actionOptions.map((a) => ({ value: a, label: a })),
                  },
                ]
              : undefined
          }
          filterValues={{ action }}
          onFilterChange={(key, value) => {
            if (key === 'action') setAction(value);
            setPage(1);
          }}
          pagination={
            audit.meta
              ? {
                  page: audit.meta.page,
                  pageSize: audit.meta.pageSize,
                  total: audit.meta.total,
                  totalPages: audit.meta.totalPages,
                }
              : undefined
          }
          onPageChange={setPage}
          emptyTitle="No audit entries"
          emptyDescription="Changes made through the portals are recorded here automatically."
          toolbarExtra={
            <Button variant="outline" size="sm" onClick={audit.reload} loading={audit.refreshing}>
              <RefreshCw />
              Refresh
            </Button>
          }
        />
      )}

      {tab === 'events' && (
        <>
          <Card>
            <div className="flex flex-wrap items-end gap-3 p-4">
              <div className="min-w-[12rem]">
                <Select
                  value={level}
                  onChange={(e) => {
                    setLevel(e.target.value);
                    setPage(1);
                  }}
                  aria-label="Filter by level"
                >
                  <option value="">All levels</option>
                  {['DEBUG', 'INFO', 'WARNING', 'ERROR'].map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </Select>
              </div>
              <Button variant="outline" size="sm" onClick={events.reload} loading={events.refreshing}>
                <RefreshCw />
                Refresh
              </Button>
            </div>
          </Card>
          <DataTable<EventRow>
            columns={eventColumns}
            rows={events.rows}
            rowKey={(row) => row.id}
            loading={events.loading}
            pagination={
              events.meta
                ? {
                    page: events.meta.page,
                    pageSize: events.meta.pageSize,
                    total: events.meta.total,
                    totalPages: events.meta.totalPages,
                  }
                : undefined
            }
            onPageChange={setPage}
            emptyTitle="No operational events"
            emptyDescription="Background jobs, queue activity and errors are logged here."
          />
        </>
      )}

      {tab === 'events' && events.rows.length === 0 && !events.loading && (
        <EmptyState
          icon={<Terminal />}
          title="Nothing logged at this level"
          description="Change the level filter to see more operational history."
          className="border-0"
        />
      )}

      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.action ?? 'Audit entry'}
        description={detail ? `${detail.actorEmail ?? 'System'} · ${formatDateTime(detail.createdAt)}` : undefined}
        size="lg"
      >
        {detail && (
          <div className="space-y-4">
            {detail.before != null && (
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--ink-muted)]">
                  <ScrollText className="size-3.5" />
                  Before
                </p>
                <pre className="scrollbar-slim max-h-56 overflow-auto rounded-lg bg-[var(--surface-sunken)] p-3 text-xs leading-relaxed text-[var(--ink)]">
                  {JSON.stringify(detail.before, null, 2)}
                </pre>
              </div>
            )}
            {detail.after != null && (
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--ink-muted)]">
                  <ScrollText className="size-3.5" />
                  After
                </p>
                <pre className="scrollbar-slim max-h-56 overflow-auto rounded-lg bg-[var(--surface-sunken)] p-3 text-xs leading-relaxed text-[var(--ink)]">
                  {JSON.stringify(detail.after, null, 2)}
                </pre>
              </div>
            )}
            <dl className="grid grid-cols-2 gap-3 border-t border-[var(--line)] pt-4 text-xs">
              <div>
                <dt className="text-[var(--ink-subtle)]">Entity</dt>
                <dd className="tabular mt-0.5 text-[var(--ink)]">{detail.entity ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[var(--ink-subtle)]">Entity ID</dt>
                <dd className="tabular mt-0.5 break-all text-[var(--ink)]">
                  {detail.entityId ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ink-subtle)]">IP address</dt>
                <dd className="tabular mt-0.5 text-[var(--ink)]">{detail.ipAddress ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[var(--ink-subtle)]">User agent</dt>
                <dd className="mt-0.5 break-all text-[var(--ink)]">{detail.userAgent ?? '—'}</dd>
              </div>
            </dl>
          </div>
        )}
      </Modal>
    </div>
  );
}
