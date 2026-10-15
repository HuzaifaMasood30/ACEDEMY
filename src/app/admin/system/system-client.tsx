'use client';

import * as React from 'react';
import {
  Activity,
  CheckCircle2,
  Clock,
  Database,
  HardDrive,
  MessageCircle,
  Play,
  RefreshCw,
  Server,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { Alert, Badge, Button } from '@/components/ui/primitives';
import { Card, CardHeader, DetailList, PageHeader, StatCard, TableWrap, Td, Th, Tr } from '@/components/ui/structure';
import { DataTable, type Column } from '@/components/ui/data-table';
import { api } from '@/lib/client-api';
import { useMutation } from '@/lib/use-resource';
import { formatDateTime, formatNumber, titleCase } from '@/lib/format';

interface SystemPayload {
  application: {
    name: string;
    environment: string;
    timezone: string;
    currency: string;
    uptimeSeconds: number;
    nodeVersion: string;
  };
  checks: {
    database: { ok: boolean; latencyMs: number };
    notificationWorker: {
      ok: boolean;
      queued: number;
      failed: number;
      last24h: number;
      simulatedLast24h: number;
    };
    whatsapp: {
      mode: string;
      configuredMode: string;
      live: boolean;
      hasPhoneNumberId: boolean;
      hasAccessToken: boolean;
      hasAppSecret: boolean;
      hasWebhookToken: boolean;
      graphVersion: string;
      defaultLocale: string;
      quietHours: { start: string; end: string };
      rateLimitPerMinute: number;
    };
    storage: { driver: string; configured: boolean };
    settingsLoaded: number;
  };
  counts: Record<string, number>;
  recentJobRuns: Array<{
    id: string;
    jobName: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    processed: number | null;
    succeeded: number | null;
    failed: number | null;
    detail: Record<string, number> | null;
    error: string | null;
  }>;
  failedNotifications: Array<{
    id: string;
    recipient: string | null;
    failureReason: string | null;
    attempts: number;
    createdAt: string;
  }>;
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
  COMPLETED: 'success',
  RUNNING: 'info',
  PENDING: 'warning',
  FAILED: 'danger',
};

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function SystemClient() {
  const [data, setData] = React.useState<SystemPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { run, pending } = useMutation();

  const load = React.useCallback(() => {
    setLoading(true);
    api
      .getOne<SystemPayload>('/api/admin/system')
      .then((payload) => {
        setData(payload);
        setError(null);
      })
      .catch(() => setError('Could not read system status.'))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const runWorker = async () => {
    const result = await run<{ processed: number; sent: number; failed: number }>(
      () => api.post('/api/admin/system', { action: 'runWorker' }),
      { success: 'Notification worker run completed.' },
    );
    if (result) load();
  };

  const refreshOverdue = async () => {
    const result = await run<{ markedOverdue: number }>(
      () => api.post('/api/admin/system', { action: 'refreshOverdue' }),
      { success: 'Overdue invoices refreshed.' },
    );
    if (result) load();
  };

  const runScheduler = async () => {
    const result = await run(
      () => api.post('/api/admin/system', { action: 'runScheduler' }),
      { success: 'Reminder scheduler run completed.' },
    );
    if (result) load();
  };

  const jobColumns: Column<SystemPayload['recentJobRuns'][number]>[] = [
    {
      key: 'jobName',
      header: 'Job',
      cell: (row) => <span className="text-sm text-[var(--ink)]">{titleCase(row.jobName)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <Badge tone={STATUS_TONE[row.status] ?? 'neutral'}>{titleCase(row.status)}</Badge>
      ),
    },
    {
      key: 'startedAt',
      header: 'Started',
      hideBelow: 'sm',
      cell: (row) => (
        <span className="tabular text-xs text-[var(--ink-muted)]">
          {formatDateTime(row.startedAt)}
        </span>
      ),
    },
    {
      key: 'processed',
      header: 'Processed',
      align: 'right',
      cell: (row) => <span className="tabular text-sm">{formatNumber(row.processed ?? 0)}</span>,
    },
    {
      key: 'succeeded',
      header: 'Succeeded',
      align: 'right',
      hideBelow: 'md',
      cell: (row) => (
        <span className="tabular text-sm text-[var(--ok)]">{formatNumber(row.succeeded ?? 0)}</span>
      ),
    },
    {
      key: 'failed',
      header: 'Failed',
      align: 'right',
      cell: (row) => (
        <span
          className={`tabular text-sm ${(row.failed ?? 0) > 0 ? 'text-[var(--danger)]' : 'text-[var(--ink-subtle)]'}`}
        >
          {formatNumber(row.failed ?? 0)}
        </span>
      ),
    },
  ];

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="System health" breadcrumbs={[{ label: 'System' }, { label: 'Health' }]} />
        <Card>
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-12 rounded-lg" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  const checks = data?.checks;
  const wa = checks?.whatsapp;

  const checkRow = (
    label: string,
    ok: boolean,
    icon: React.ReactNode,
    detail: React.ReactNode,
  ) => (
    <div className="flex items-start gap-3 py-3">
      <span
        className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${
          ok
            ? 'bg-[var(--ok-soft)] text-[var(--ok-soft-ink)]'
            : 'bg-[var(--danger-soft)] text-[var(--danger-soft-ink)]'
        }`}
      >
        {ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--ink)]">
          <span className="text-[var(--ink-subtle)]">{icon}</span>
          {label}
        </p>
        <div className="mt-0.5 text-xs text-[var(--ink-muted)]">{detail}</div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="System health"
        description="Live status of the database, notification worker, WhatsApp provider and storage."
        breadcrumbs={[{ label: 'System' }, { label: 'Health' }]}
        actions={
          <>
            <Button variant="outline" onClick={load} loading={loading}>
              <RefreshCw />
              Refresh
            </Button>
            <Button variant="outline" onClick={runScheduler} loading={pending}>
              <Clock />
              Run scheduler
            </Button>
            <Button variant="outline" onClick={refreshOverdue} loading={pending}>
              <Clock />
              Refresh overdue
            </Button>
            <Button onClick={runWorker} loading={pending}>
              <Play />
              Drain queue
            </Button>
          </>
        }
      />

      {error && (
        <Alert tone="danger" title="Status unavailable">
          {error}
        </Alert>
      )}

      {wa && !wa.live && (
        <Alert tone="warning" title="WhatsApp is running in mock mode">
          Messages are recorded and delivered to the local queue but are not sent to a real phone
          number. {wa.configuredMode === 'mock' ? 'No provider credentials are configured.' : ''} See
          the WhatsApp settings page for the credentials required to go live.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Database"
          value={checks?.database.ok ? 'Healthy' : 'Down'}
          hint={checks ? `${checks.database.latencyMs} ms latency` : undefined}
          icon={<Database />}
          tone={checks?.database.ok ? 'success' : 'danger'}
        />
        <StatCard
          label="Queue"
          value={formatNumber(checks?.notificationWorker.queued ?? 0)}
          hint={
            checks
              ? `${formatNumber(checks.notificationWorker.failed)} failed · ${formatNumber(
                  checks.notificationWorker.last24h,
                )} sent in 24h`
              : undefined
          }
          icon={<Activity />}
          tone={(checks?.notificationWorker.failed ?? 0) > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="WhatsApp"
          value={wa?.live ? 'Live' : 'Mock mode'}
          hint={wa ? `Graph ${wa.graphVersion} · ${wa.rateLimitPerMinute}/min` : undefined}
          icon={<MessageCircle />}
          tone={wa?.live ? 'success' : 'warning'}
        />
        <StatCard
          label="Uptime"
          value={data ? formatUptime(data.application.uptimeSeconds) : '—'}
          hint={data ? `Node ${data.application.nodeVersion}` : undefined}
          icon={<Server />}
          tone="info"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Service checks" icon={<Activity />} />
          <div className="divide-y divide-[var(--line)] px-4 sm:px-5">
            {checks &&
              checkRow(
                'Database connection',
                checks.database.ok,
                <Database className="size-3.5" />,
                checks.database.ok
                  ? `Responding in ${checks.database.latencyMs} ms.`
                  : 'The database did not respond to a simple query.',
              )}
            {checks &&
              checkRow(
                'Notification worker',
                checks.notificationWorker.ok,
                <Activity className="size-3.5" />,
                <>
                  {formatNumber(checks.notificationWorker.queued)} queued ·{' '}
                  {formatNumber(checks.notificationWorker.failed)} failed ·{' '}
                  {formatNumber(checks.notificationWorker.simulatedLast24h)} of{' '}
                  {formatNumber(checks.notificationWorker.last24h)} sent in the last 24 hours were
                  simulated.
                </>,
              )}
            {checks &&
              checkRow(
                'WhatsApp provider',
                Boolean(wa?.live),
                <MessageCircle className="size-3.5" />,
                <>
                  Mode <strong>{wa?.mode}</strong>. Credentials present: phone number ID{' '}
                  {wa?.hasPhoneNumberId ? 'yes' : 'no'}, access token {wa?.hasAccessToken ? 'yes' : 'no'},
                  app secret {wa?.hasAppSecret ? 'yes' : 'no'}, webhook token{' '}
                  {wa?.hasWebhookToken ? 'yes' : 'no'}.
                </>,
              )}
            {checks &&
              checkRow(
                'File storage',
                checks.storage.configured,
                <HardDrive className="size-3.5" />,
                <>
                  Driver <strong>{checks.storage.driver}</strong>.
                  {checks.storage.driver === 'local'
                    ? ' Local storage is suitable for development only.'
                    : ''}
                </>,
              )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Application" icon={<Server />} />
          <div className="p-4 sm:p-5">
            <DetailList
              items={[
                { label: 'Academy', value: data?.application.name ?? '—' },
                { label: 'Environment', value: data?.application.environment ?? '—' },
                { label: 'Timezone', value: data?.application.timezone ?? '—' },
                { label: 'Currency', value: data?.application.currency ?? '—' },
                { label: 'Node version', value: data?.application.nodeVersion ?? '—' },
                { label: 'Uptime', value: data ? formatUptime(data.application.uptimeSeconds) : '—' },
                { label: 'Settings loaded', value: formatNumber(checks?.settingsLoaded ?? 0) },
                {
                  label: 'Quiet hours',
                  value: wa ? `${wa.quietHours.start} – ${wa.quietHours.end}` : '—',
                },
              ]}
            />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Record counts"
          description="Row counts across the principal tables, for capacity planning and backups."
          icon={<Database />}
        />
        <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 sm:p-5 lg:grid-cols-6">
          {Object.entries(data?.counts ?? {}).map(([key, value]) => (
            <div key={key}>
              <p className="tabular text-xl font-semibold text-[var(--ink)]">
                {formatNumber(value)}
              </p>
              <p className="text-xs text-[var(--ink-muted)]">{titleCase(key)}</p>
            </div>
          ))}
        </div>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-[var(--ink)]">Recent background jobs</h2>
        <DataTable
          columns={jobColumns}
          rows={data?.recentJobRuns ?? []}
          rowKey={(row) => row.id}
          emptyTitle="No jobs have run yet"
          emptyDescription="Queue drains and scheduled reminders appear here once they execute."
        />
      </div>

      {data && data.failedNotifications.length > 0 && (
        <Card>
          <CardHeader
            title="Failed notifications"
            description="Messages that exhausted their retry budget and need review."
            icon={<TriangleAlert />}
          />
          <TableWrap>
            <thead>
              <tr>
                <Th>Recipient</Th>
                <Th>Reason</Th>
                <Th align="right">Attempts</Th>
                <Th align="right">Raised</Th>
              </tr>
            </thead>
            <tbody>
              {data.failedNotifications.map((row) => (
                <Tr key={row.id}>
                  <Td>
                    <span className="text-sm text-[var(--ink)]">{row.recipient ?? '—'}</span>
                  </Td>
                  <Td>
                    <span className="text-xs text-[var(--danger)]">
                      {row.failureReason ?? 'Unknown failure'}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="tabular text-sm">{row.attempts}</span>
                  </Td>
                  <Td align="right">
                    <span className="tabular text-xs text-[var(--ink-muted)]">
                      {formatDateTime(row.createdAt)}
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}

      {data && data.failedNotifications.length === 0 && (
        <Alert tone="success" title="No failed notifications">
          Every queued message has been accepted by the provider or is still awaiting a retry.
        </Alert>
      )}
    </div>
  );
}
