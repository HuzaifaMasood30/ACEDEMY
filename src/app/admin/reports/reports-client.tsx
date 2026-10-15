'use client';

import * as React from 'react';
import { BarChart3, Download, FileSpreadsheet, Filter, RotateCcw } from 'lucide-react';
import { Alert, Badge, Button, Field, Input, Select } from '@/components/ui/primitives';
import {
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  TableWrap,
  Td,
  Th,
  Tr,
} from '@/components/ui/structure';
import { api } from '@/lib/client-api';
import { useResource } from '@/lib/use-resource';
import { formatNumber } from '@/lib/format';

type ReportKey = 'enrollment' | 'attendance' | 'exams' | 'fees' | 'collections' | 'dues';

interface ReportOption {
  key: ReportKey;
  label: string;
  description: string;
  /** Money reports are only served to roles holding FINANCE_REPORTS. */
  finance: boolean;
}

const REPORT_OPTIONS: ReportOption[] = [
  {
    key: 'enrollment',
    label: 'Enrollment',
    description: 'Active classes, enrolled counts, capacity and utilisation.',
    finance: false,
  },
  {
    key: 'attendance',
    label: 'Attendance',
    description: 'Per-student totals and attendance percentage against the threshold.',
    finance: false,
  },
  {
    key: 'exams',
    label: 'Examination results',
    description: 'Published marks, percentages and grades per subject.',
    finance: false,
  },
  {
    key: 'fees',
    label: 'Fee register',
    description: 'Every issued invoice with subtotal, discount, paid and balance.',
    finance: true,
  },
  {
    key: 'collections',
    label: 'Daily collections',
    description: 'Receipts by date, method, reference and amount.',
    finance: true,
  },
  {
    key: 'dues',
    label: 'Dues and aging',
    description: 'Outstanding balances with days overdue and aging buckets.',
    finance: true,
  },
];

interface ClassOption {
  id: string;
  name: string;
  course: { name: string };
}

interface SessionOption {
  id: string;
  name: string;
  isCurrent: boolean;
}

type Row = Record<string, unknown>;

export function ReportsClient() {
  const [report, setReport] = React.useState<ReportKey>('enrollment');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [classSectionId, setClassSectionId] = React.useState('');
  const [academicSessionId, setAcademicSessionId] = React.useState('');

  const classes = useResource<ClassOption>('/api/admin/classes', { params: { pageSize: 200 } });

  const sessions = useResource<never>('/api/admin/sessions');
  const sessionList = (sessions as unknown as { raw?: { sessions?: SessionOption[] } }).raw
    ?.sessions;

  const resource = useResource<Row>('/api/admin/reports', {
    params: {
      report,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(classSectionId ? { classSectionId } : {}),
      ...(academicSessionId ? { academicSessionId } : {}),
    },
  });

  const rows = resource.rows;
  // Column order comes from the server's row construction, which Object.keys
  // preserves for the string keys it builds.
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

  const selected = REPORT_OPTIONS.find((o) => o.key === report)!;

  const exportUrl = api.exportUrl('/api/admin/reports', {
    report,
    format: 'csv',
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(classSectionId ? { classSectionId } : {}),
    ...(academicSessionId ? { academicSessionId } : {}),
  });

  const clearFilters = () => {
    setFrom('');
    setTo('');
    setClassSectionId('');
    setAcademicSessionId('');
  };

  const filtersActive = Boolean(from || to || classSectionId || academicSessionId);
  const forbidden = resource.error != null && /financial|permission|access/i.test(resource.error);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Generate, review and export academy data as live figures."
        breadcrumbs={[{ label: 'Insights' }, { label: 'Reports' }]}
        actions={
          <Button
            variant="outline"
            disabled={forbidden || rows.length === 0}
            onClick={() => {
              window.location.href = exportUrl;
            }}
          >
            <Download />
            Export CSV
          </Button>
        }
      />

      <Card>
        <CardHeader
          title="Choose a report"
          description="Financial reports are restricted to administrator and finance roles."
          icon={<BarChart3 />}
        />
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-5">
          {REPORT_OPTIONS.map((option) => {
            const active = option.key === report;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setReport(option.key)}
                aria-pressed={active}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  active
                    ? 'border-[var(--brand)] bg-[var(--brand-soft)]'
                    : 'border-[var(--line)] hover:border-[var(--brand)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[var(--ink)]">{option.label}</span>
                  {option.finance && <Badge tone="warning">Finance</Badge>}
                </div>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">{option.description}</p>
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Filters"
          description="Narrow the report by date range, class or academic session."
          icon={<Filter />}
          action={
            filtersActive ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <RotateCcw />
                Clear
              </Button>
            ) : undefined
          }
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
          <Field label="From date" htmlFor="rp-from">
            <Input
              id="rp-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="To date" htmlFor="rp-to">
            <Input id="rp-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="Class" htmlFor="rp-class">
            <Select
              id="rp-class"
              value={classSectionId}
              onChange={(e) => setClassSectionId(e.target.value)}
            >
              <option value="">All classes</option>
              {classes.rows.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Academic session" htmlFor="rp-session">
            <Select
              id="rp-session"
              value={academicSessionId}
              onChange={(e) => setAcademicSessionId(e.target.value)}
            >
              <option value="">All sessions</option>
              {(sessionList ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.isCurrent ? ' (current)' : ''}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {resource.error && (
        <Alert tone={forbidden ? 'warning' : 'danger'} title="Report unavailable">
          {resource.error}
        </Alert>
      )}

      {!resource.error && (
        <Card>
          <CardHeader
            title={selected.label}
            description={selected.description}
            icon={<FileSpreadsheet />}
            action={
              <span className="text-xs text-[var(--ink-muted)]">
                {formatNumber(rows.length)} row{rows.length === 1 ? '' : 's'}
              </span>
            }
          />

          {resource.loading && rows.length === 0 ? (
            <div className="space-y-2 p-5">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skeleton h-10 rounded-lg" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<FileSpreadsheet />}
                title="No rows for this report"
                description="Adjust the filters, or confirm that data exists for the selected range."
              />
            </div>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  {headers.map((header, index) => (
                    <Th
                      key={header}
                      align={index === 0 ? 'left' : 'right'}
                      hideBelow={index >= 3 ? 'md' : undefined}
                    >
                      {header}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <Tr key={rowIndex}>
                    {headers.map((header, index) => {
                      const value = row[header];
                      const display =
                        value === null || value === undefined || value === ''
                          ? '—'
                          : String(value);
                      return (
                        <Td
                          key={header}
                          align={index === 0 ? 'left' : 'right'}
                          hideBelow={index >= 3 ? 'md' : undefined}
                        >
                          <span
                            className={
                              index === 0
                                ? 'text-sm font-medium text-[var(--ink)]'
                                : 'tabular text-sm text-[var(--ink-muted)]'
                            }
                          >
                            {display}
                          </span>
                        </Td>
                      );
                    })}
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      )}

      <div className="flex justify-end">
        <Button variant="ghost" onClick={() => resource.reload()} loading={resource.loading}>
          Refresh report
        </Button>
      </div>
    </div>
  );
}
