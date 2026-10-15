'use client';

import * as React from 'react';
import { AlertTriangle, Clock, Download, RefreshCw, TrendingDown, Wallet } from 'lucide-react';
import { Alert, Badge, Button, Field, Select } from '@/components/ui/primitives';
import { Card, PageHeader, StatCard } from '@/components/ui/structure';
import { DataTable, type Column } from '@/components/ui/data-table';
import { api } from '@/lib/client-api';
import { useResource } from '@/lib/use-resource';
import { formatMoney, formatNumber, titleCase } from '@/lib/format';

interface DueRow {
  Invoice: string;
  Due: string;
  Student: string;
  'Admission No': string;
  'Guardian phone': string;
  Total: string;
  Paid: string;
  Balance: string;
  'Days overdue': number;
  'Aging bucket': string;
}

const BUCKET_TONE: Record<string, 'neutral' | 'info' | 'warning' | 'danger'> = {
  'Not due': 'neutral',
  '1-30': 'info',
  '31-60': 'warning',
  '60+': 'danger',
};

export function DuesClient() {
  const [bucket, setBucket] = React.useState('');
  const [classSectionId, setClassSectionId] = React.useState('');
  const [classes, setClasses] = React.useState<Array<{ id: string; name: string }>>([]);

  const resource = useResource<DueRow>('/api/admin/reports', {
    params: { report: 'dues', classSectionId },
  });

  React.useEffect(() => {
    api
      .getOne<{ rows: Array<{ id: string; name: string }> }>('/api/admin/classes', { pageSize: 200 })
      .then((data) => setClasses(data.rows ?? []))
      .catch(() => undefined);
  }, []);

  const rows = React.useMemo(
    () => (bucket ? resource.rows.filter((row) => row['Aging bucket'] === bucket) : resource.rows),
    [resource.rows, bucket],
  );

  const columns: Column<DueRow>[] = [
    {
      key: 'Invoice',
      header: 'Invoice',
      sortable: true,
      cell: (row) => (
        <div className="min-w-0">
          <span className="tabular block truncate text-sm font-medium text-[var(--ink)]">
            {row.Invoice}
          </span>
          <span className="block truncate text-[0.6875rem] text-[var(--ink-subtle)]">
            {row['Admission No']} · {row.Student}
          </span>
        </div>
      ),
    },
    {
      key: 'Due',
      header: 'Due date',
      hideBelow: 'md',
      cell: (row) => <span className="tabular text-xs text-[var(--ink-muted)]">{row.Due}</span>,
    },
    {
      key: 'Total',
      header: 'Invoiced',
      align: 'right',
      hideBelow: 'lg',
      cell: (row) => (
        <span className="tabular text-sm text-[var(--ink-muted)]">
          {formatMoney(Number(row.Total))}
        </span>
      ),
    },
    {
      key: 'Paid',
      header: 'Paid',
      align: 'right',
      hideBelow: 'sm',
      cell: (row) => (
        <span className="tabular text-sm text-[var(--ok)]">{formatMoney(Number(row.Paid))}</span>
      ),
    },
    {
      key: 'Balance',
      header: 'Outstanding',
      align: 'right',
      cell: (row) => (
        <span className="tabular text-sm font-semibold text-[var(--danger)]">
          {formatMoney(Number(row.Balance))}
        </span>
      ),
    },
    {
      key: 'days',
      header: 'Days overdue',
      align: 'right',
      cell: (row) => (
        <span
          className={
            row['Days overdue'] > 60
              ? 'tabular text-sm font-semibold text-[var(--danger)]'
              : 'tabular text-sm text-[var(--ink-muted)]'
          }
        >
          {row['Days overdue']}
        </span>
      ),
    },
    {
      key: 'bucket',
      header: 'Aging',
      cell: (row) => (
        <Badge tone={BUCKET_TONE[row['Aging bucket']] ?? 'neutral'}>{row['Aging bucket']}</Badge>
      ),
    },
    {
      key: 'phone',
      header: 'Guardian phone',
      hideBelow: 'lg',
      cell: (row) => (
        <span className="tabular text-xs text-[var(--ink-muted)]">
          {row['Guardian phone'] || 'Not on file'}
        </span>
      ),
    },
  ];

  const outstanding = rows.reduce((sum, row) => sum + Number(row.Balance), 0);
  const over60 = rows.filter((row) => row['Aging bucket'] === '60+');
  const noPhone = rows.filter((row) => !row['Guardian phone']).length;

  const exportCsv = () => {
    const url = api.exportUrl('/api/admin/reports', {
      report: 'dues',
      format: 'csv',
      classSectionId,
    });
    window.location.href = url;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Outstanding dues"
        description="Every unpaid balance with an aging bucket, so follow-up can be prioritised."
        breadcrumbs={[{ label: 'Finance' }, { label: 'Dues' }]}
        actions={
          <>
            <Button variant="outline" onClick={resource.reload} loading={resource.refreshing}>
              <RefreshCw />
              Refresh
            </Button>
            <Button onClick={exportCsv}>
              <Download />
              Export CSV
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Outstanding"
          value={formatMoney(outstanding)}
          icon={<TrendingDown />}
          tone={outstanding > 0 ? 'danger' : 'success'}
        />
        <StatCard
          label="Unpaid invoices"
          value={formatNumber(rows.length)}
          icon={<Wallet />}
          tone="warning"
        />
        <StatCard
          label="Over 60 days"
          value={formatNumber(over60.length)}
          icon={<AlertTriangle />}
          tone={over60.length > 0 ? 'danger' : 'success'}
          hint={over60.length > 0 ? formatMoney(over60.reduce((s, r) => s + Number(r.Balance), 0)) : undefined}
        />
        <StatCard
          label="No guardian phone"
          value={formatNumber(noPhone)}
          icon={<Clock />}
          tone={noPhone > 0 ? 'warning' : 'success'}
          hint="Cannot receive WhatsApp reminders"
        />
      </div>

      {resource.error && (
        <Alert tone="danger" title="Could not load dues">
          {resource.error}
        </Alert>
      )}

      {noPhone > 0 && (
        <Alert tone="warning" title="Some guardians have no phone number">
          {noPhone} unpaid invoice{noPhone === 1 ? '' : 's'} belong to students without a guardian
          phone on file, so absence and fee reminders cannot reach them. Add a contact number from the
          student’s guardian record.
        </Alert>
      )}

      <Card>
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Aging bucket" htmlFor="dues-bucket">
            <Select id="dues-bucket" value={bucket} onChange={(e) => setBucket(e.target.value)}>
              <option value="">All ages</option>
              {['Not due', '1-30', '31-60', '60+'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Class" htmlFor="dues-class">
            <Select
              id="dues-class"
              value={classSectionId}
              onChange={(e) => setClassSectionId(e.target.value)}
            >
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <DataTable<DueRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.Invoice}
        loading={resource.loading}
        emptyTitle="No outstanding dues"
        emptyDescription="Every issued invoice has been settled."
      />

      <p className="text-xs text-[var(--ink-subtle)]">
        Aging buckets are calculated from the invoice due date to today: not due, 1–30 days, 31–60
        days, and more than 60 days.
      </p>
    </div>
  );
}
