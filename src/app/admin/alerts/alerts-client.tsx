'use client';

import * as React from 'react';
import { BellRing, CheckCircle2, RefreshCw, ShieldAlert, TriangleAlert } from 'lucide-react';
import { Alert, Badge, Button, Select, Switch, Textarea } from '@/components/ui/primitives';
import { Card, CardHeader, EmptyState, PageHeader, StatCard } from '@/components/ui/structure';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Modal, Tabs } from '@/components/ui/overlays';
import { api } from '@/lib/client-api';
import { useMutation, useResource } from '@/lib/use-resource';
import { formatDateTime, formatNumber, titleCase } from '@/lib/format';

interface AlertRow {
  id: string;
  ruleCode: string;
  severity: string;
  title: string;
  detail: string | null;
  isResolved: boolean;
  resolvedAt: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
  student: {
    id: string;
    admissionNo: string;
    firstName: string;
    lastName: string;
    enrollments: Array<{ classSection: { id: string; name: string } }>;
  };
}

interface RuleRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  severity: string;
  threshold: string | null;
  isEnabled: boolean;
}

interface Summary {
  unresolved: number;
  bySeverity: Record<string, number>;
  byRule: Record<string, number>;
}

const SEVERITY_TONE: Record<string, 'danger' | 'warning' | 'info' | 'neutral'> = {
  CRITICAL: 'danger',
  HIGH: 'danger',
  WARNING: 'warning',
  INFO: 'info',
};

export function AlertsClient() {
  const [tab, setTab] = React.useState<'alerts' | 'rules'>('alerts');
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [severity, setSeverity] = React.useState('');
  const [ruleCode, setRuleCode] = React.useState('');
  const [resolved, setResolved] = React.useState('false');
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [resolveTarget, setResolveTarget] = React.useState<AlertRow | null>(null);
  const [resolveNote, setResolveNote] = React.useState('');

  const { run, pending } = useMutation();

  const alerts = useResource<AlertRow>('/api/admin/alerts', {
    params: {
      scope: 'alerts',
      page,
      pageSize: 20,
      q: search,
      severity,
      ruleCode,
      resolved,
    },
    debounceMs: 250,
    enabled: tab === 'alerts',
  });

  const rules = useResource<RuleRow>('/api/admin/alerts', {
    params: { scope: 'rules' },
    enabled: tab === 'rules',
  });

  const loadSummary = React.useCallback(() => {
    api
      .getOne<Summary>('/api/admin/alerts', { scope: 'summary' })
      .then(setSummary)
      .catch(() => undefined);
  }, []);

  React.useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const refresh = async () => {
    const result = await run<{ evaluated: number; created: number }>(
      () => api.post('/api/admin/alerts', {}),
      { success: 'Warning rules re-evaluated.' },
    );
    if (result) {
      alerts.reload();
      loadSummary();
    }
  };

  const resolve = async () => {
    if (!resolveTarget) return;
    const result = await run(
      () =>
        api.put('/api/admin/alerts', {
          action: 'resolve',
          alertId: resolveTarget.id,
          note: resolveNote.trim() || undefined,
        }),
      { success: 'Alert resolved.' },
    );
    if (result) {
      setResolveTarget(null);
      setResolveNote('');
      alerts.reload();
      loadSummary();
    }
  };

  const reopen = async (row: AlertRow) => {
    const result = await run(
      () => api.put('/api/admin/alerts', { action: 'reopen', alertId: row.id }),
      { success: 'Alert reopened.' },
    );
    if (result) {
      alerts.reload();
      loadSummary();
    }
  };

  const toggleRule = async (rule: RuleRow, isEnabled: boolean) => {
    const result = await run(
      () => api.put('/api/admin/alerts', { action: 'toggleRule', ruleId: rule.id, isEnabled }),
      { success: isEnabled ? 'Rule enabled.' : 'Rule disabled.' },
    );
    if (result) rules.reload();
  };

  const columns: Column<AlertRow>[] = [
    {
      key: 'student',
      header: 'Student',
      cell: (row) => (
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium text-[var(--ink)]">
            {row.student.firstName} {row.student.lastName}
          </span>
          <span className="tabular block truncate text-[0.6875rem] text-[var(--ink-subtle)]">
            {row.student.admissionNo}
            {row.student.enrollments[0] ? ` · ${row.student.enrollments[0].classSection.name}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'alert',
      header: 'Alert',
      cell: (row) => (
        <div className="min-w-0">
          <span className="block text-sm text-[var(--ink)]">{row.title}</span>
          {row.detail && (
            <span className="mt-0.5 block max-w-[28rem] text-xs text-[var(--ink-muted)]">
              {row.detail}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'ruleCode',
      header: 'Rule',
      hideBelow: 'lg',
      cell: (row) => <Badge tone="neutral">{titleCase(row.ruleCode)}</Badge>,
    },
    {
      key: 'severity',
      header: 'Severity',
      cell: (row) => (
        <Badge tone={SEVERITY_TONE[row.severity] ?? 'neutral'}>{titleCase(row.severity)}</Badge>
      ),
    },
    {
      key: 'createdAt',
      header: 'Raised',
      align: 'right',
      hideBelow: 'md',
      cell: (row) => (
        <span className="tabular text-xs text-[var(--ink-muted)]">
          {formatDateTime(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) =>
        row.isResolved ? (
          <Button variant="ghost" size="sm" onClick={() => reopen(row)}>
            Reopen
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setResolveTarget(row)}>
            <CheckCircle2 />
            Resolve
          </Button>
        ),
    },
  ];

  const ruleColumns: Column<RuleRow>[] = [
    {
      key: 'name',
      header: 'Rule',
      cell: (row) => (
        <div className="min-w-0">
          <span className="block text-sm font-medium text-[var(--ink)]">{row.name}</span>
          {row.description && (
            <span className="mt-0.5 block text-xs text-[var(--ink-muted)]">{row.description}</span>
          )}
          <span className="tabular mt-0.5 block text-[0.6875rem] text-[var(--ink-subtle)]">
            {row.code}
          </span>
        </div>
      ),
    },
    {
      key: 'threshold',
      header: 'Threshold',
      align: 'right',
      hideBelow: 'sm',
      cell: (row) => (
        <span className="tabular text-sm">{row.threshold ?? '—'}</span>
      ),
    },
    {
      key: 'severity',
      header: 'Severity',
      cell: (row) => (
        <Badge tone={SEVERITY_TONE[row.severity] ?? 'neutral'}>{titleCase(row.severity)}</Badge>
      ),
    },
    {
      key: 'open',
      header: 'Open alerts',
      align: 'right',
      hideBelow: 'md',
      cell: (row) => (
        <span className="tabular text-sm">{formatNumber(summary?.byRule[row.code] ?? 0)}</span>
      ),
    },
    {
      key: 'enabled',
      header: 'Enabled',
      align: 'right',
      cell: (row) => (
        <Switch
          checked={row.isEnabled}
          onChange={(checked) => toggleRule(row, checked)}
          aria-label={`Toggle ${row.name}`}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student alerts"
        description="Advisory warnings raised by the progress engine. These never change a student's status automatically."
        breadcrumbs={[{ label: 'Overview' }, { label: 'Alerts' }]}
        actions={
          <>
            <Button variant="outline" onClick={loadSummary}>
              <RefreshCw />
              Refresh
            </Button>
            <Button onClick={refresh} loading={pending}>
              <ShieldAlert />
              Re-evaluate rules
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Unresolved"
          value={formatNumber(summary?.unresolved ?? 0)}
          icon={<BellRing />}
          tone={(summary?.unresolved ?? 0) > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Critical"
          value={formatNumber(summary?.bySeverity.CRITICAL ?? 0)}
          icon={<TriangleAlert />}
          tone={(summary?.bySeverity.CRITICAL ?? 0) > 0 ? 'danger' : 'success'}
        />
        <StatCard
          label="Warnings"
          value={formatNumber(summary?.bySeverity.WARNING ?? 0)}
          icon={<TriangleAlert />}
          tone="warning"
        />
        <StatCard
          label="Rules enabled"
          value={`${rules.rows.filter((r) => r.isEnabled).length}/${rules.rows.length || 0}`}
          icon={<ShieldAlert />}
          tone="info"
        />
      </div>

      <Tabs
        tabs={[
          { value: 'alerts', label: 'Raised alerts', count: summary?.unresolved },
          { value: 'rules', label: 'Warning rules' },
        ]}
        value={tab}
        onChange={(value) => setTab(value as 'alerts' | 'rules')}
      />

      {alerts.error && (
        <Alert tone="danger" title="Could not load alerts">
          {alerts.error}
        </Alert>
      )}
      {rules.error && (
        <Alert tone="danger" title="Could not load warning rules">
          {rules.error}
        </Alert>
      )}

      {tab === 'alerts' && (
        <DataTable<AlertRow>
          columns={columns}
          rows={alerts.rows}
          rowKey={(row) => row.id}
          loading={alerts.loading}
          searchable
          searchPlaceholder="Search by student name or admission number…"
          searchValue={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          filters={[
            {
              key: 'resolved',
              label: 'Status',
              options: [
                { value: 'false', label: 'Open' },
                { value: 'true', label: 'Resolved' },
                { value: '', label: 'All' },
              ],
            },
            {
              key: 'severity',
              label: 'Severity',
              options: ['CRITICAL', 'WARNING', 'INFO'].map((v) => ({
                value: v,
                label: titleCase(v),
              })),
            },
            {
              key: 'ruleCode',
              label: 'Rule',
              options: (rules.rows.length ? rules.rows : []).map((r) => ({
                value: r.code,
                label: r.name,
              })),
            },
          ]}
          filterValues={{ resolved, severity, ruleCode }}
          onFilterChange={(key, value) => {
            if (key === 'resolved') setResolved(value);
            if (key === 'severity') setSeverity(value);
            if (key === 'ruleCode') setRuleCode(value);
            setPage(1);
          }}
          pagination={
            alerts.meta
              ? {
                  page: alerts.meta.page,
                  pageSize: alerts.meta.pageSize,
                  total: alerts.meta.total,
                  totalPages: alerts.meta.totalPages,
                }
              : undefined
          }
          onPageChange={setPage}
          emptyTitle="No alerts raised"
          emptyDescription="Nothing currently breaches the configured warning thresholds. Run a re-evaluation to check again."
          toolbarExtra={
            <Button
              variant="outline"
              size="sm"
              onClick={alerts.reload}
              loading={alerts.refreshing}
            >
              <RefreshCw />
              Refresh
            </Button>
          }
        />
      )}

      {tab === 'rules' && (
        <DataTable<RuleRow>
          columns={ruleColumns}
          rows={rules.rows}
          rowKey={(row) => row.id}
          loading={rules.loading}
          emptyTitle="No warning rules configured"
          emptyDescription="Warning rules define the thresholds that raise alerts."
        />
      )}

      {tab === 'alerts' && alerts.rows.length === 0 && !alerts.loading && (
        <EmptyState
          icon={<BellRing />}
          title="No alerts to review"
          description="Alerts appear here when a student crosses an attendance, marks, assignment or fee threshold."
          className="border-0"
        />
      )}

      <Modal
        open={resolveTarget !== null}
        onClose={() => setResolveTarget(null)}
        title="Resolve this alert"
        description={
          resolveTarget
            ? `${resolveTarget.student.firstName} ${resolveTarget.student.lastName} — ${resolveTarget.title}`
            : undefined
        }
        size="sm"
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="outline" onClick={() => setResolveTarget(null)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={resolve} loading={pending}>
              <CheckCircle2 />
              Mark resolved
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="info" title="Resolution is a record, not an action">
            Resolving marks the alert as handled and notes who closed it. No student record is
            changed by this.
          </Alert>
          <Textarea
            rows={3}
            value={resolveNote}
            onChange={(e) => setResolveNote(e.target.value)}
            placeholder="Spoke with the guardian; attendance is expected to improve from next week."
            aria-label="Resolution note"
          />
        </div>
      </Modal>
    </div>
  );
}
