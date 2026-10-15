'use client';

import * as React from 'react';
import { Banknote, CreditCard, RefreshCw, RotateCcw, Receipt } from 'lucide-react';
import { Alert, Badge, Button, Field, Select, Textarea } from '@/components/ui/primitives';
import { Card, EmptyState, PageHeader, StatCard } from '@/components/ui/structure';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Modal } from '@/components/ui/overlays';
import { api } from '@/lib/client-api';
import { useMutation, useResource } from '@/lib/use-resource';
import { formatDateTime, formatMoney, formatNumber, titleCase } from '@/lib/format';

interface PaymentRow {
  id: string;
  receiptNo: string;
  amount: string;
  method: string;
  status: string;
  paidAt: string;
  reference: string | null;
  student: { id: string; firstName: string; lastName: string; admissionNo: string };
  invoice: { id: string; invoiceNo: string };
}

const METHOD_TONE: Record<string, 'brand' | 'info' | 'accent' | 'success'> = {
  CASH: 'success',
  BANK_TRANSFER: 'brand',
  CARD: 'info',
  ONLINE: 'accent',
  CHEQUE: 'brand',
  OTHER: 'info',
};

export function PaymentsClient() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [method, setMethod] = React.useState('');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [reverseTarget, setReverseTarget] = React.useState<PaymentRow | null>(null);
  const [reverseReason, setReverseReason] = React.useState('');

  const { run, pending } = useMutation();

  const resource = useResource<PaymentRow>('/api/admin/fees', {
    params: { scope: 'payments', page, pageSize: 20, q: search, method, from, to },
    debounceMs: 250,
  });

  const columns: Column<PaymentRow>[] = [
    {
      key: 'receiptNo',
      header: 'Receipt',
      sortable: true,
      cell: (row) => (
        <div className="min-w-0">
          <span className="tabular block truncate text-sm font-medium text-[var(--ink)]">
            {row.receiptNo}
          </span>
          <span className="block truncate text-[0.6875rem] text-[var(--ink-subtle)]">
            {row.invoice.invoiceNo}
          </span>
        </div>
      ),
    },
    {
      key: 'student',
      header: 'Student',
      cell: (row) => (
        <div className="min-w-0">
          <span className="block truncate text-sm text-[var(--ink)]">
            {row.student.firstName} {row.student.lastName}
          </span>
          <span className="tabular block text-[0.6875rem] text-[var(--ink-subtle)]">
            {row.student.admissionNo}
          </span>
        </div>
      ),
    },
    {
      key: 'method',
      header: 'Method',
      cell: (row) => (
        <Badge tone={METHOD_TONE[row.method] ?? 'info'}>{titleCase(row.method)}</Badge>
      ),
    },
    {
      key: 'reference',
      header: 'Reference',
      hideBelow: 'lg',
      cell: (row) => (
        <span className="tabular text-xs text-[var(--ink-muted)]">{row.reference ?? '—'}</span>
      ),
    },
    {
      key: 'paidAt',
      header: 'Paid',
      align: 'right',
      cell: (row) => (
        <span className="tabular text-xs text-[var(--ink-muted)]">
          {formatDateTime(row.paidAt)}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      cell: (row) => (
        <span
          className={
            row.status === 'REVERSED'
              ? 'tabular text-sm text-[var(--ink-subtle)] line-through'
              : 'tabular text-sm font-medium text-[var(--ok)]'
          }
        >
          {formatMoney(Number(row.amount))}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <Badge tone={row.status === 'COMPLETED' ? 'success' : 'danger'}>
          {titleCase(row.status)}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) =>
        row.status === 'COMPLETED' ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setReverseTarget(row);
              setReverseReason('');
            }}
          >
            <RotateCcw />
            Reverse
          </Button>
        ) : null,
    },
  ];

  const total = resource.rows
    .filter((row) => row.status === 'COMPLETED')
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const reversed = resource.rows.filter((row) => row.status === 'REVERSED').length;

  const reverse = async () => {
    if (!reverseTarget) return;
    const result = await run(
      () =>
        api.put('/api/admin/fees', {
          action: 'reversePayment',
          paymentId: reverseTarget.id,
          reason: reverseReason.trim(),
        }),
      { success: 'Payment reversed and the invoice balance restored.' },
    );
    if (result) {
      setReverseTarget(null);
      resource.reload();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Receipts recorded against invoices. Reversals restore the invoice balance."
        breadcrumbs={[{ label: 'Finance' }, { label: 'Payments' }]}
        actions={
          <Button variant="outline" onClick={resource.reload} loading={resource.refreshing}>
            <RefreshCw />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Receipts"
          value={formatNumber(resource.meta?.total ?? 0)}
          icon={<Receipt />}
          tone="brand"
        />
        <StatCard label="Shown total" value={formatMoney(total)} icon={<Banknote />} tone="success" />
        <StatCard
          label="Reversed"
          value={formatNumber(reversed)}
          icon={<RotateCcw />}
          tone={reversed > 0 ? 'warning' : 'success'}
          hint="On this page"
        />
        <StatCard
          label="Methods"
          value={formatNumber(new Set(resource.rows.map((r) => r.method)).size)}
          icon={<CreditCard />}
          tone="info"
          hint="Distinct methods on this page"
        />
      </div>

      {resource.error && (
        <Alert tone="danger" title="Could not load payments">
          {resource.error}
        </Alert>
      )}

      <Card>
        <div className="grid gap-4 p-4 sm:grid-cols-3 sm:p-5">
          <Field label="Method" htmlFor="pay-filter-method">
            <Select
              id="pay-filter-method"
              value={method}
              onChange={(e) => {
                setMethod(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All methods</option>
              {['CASH', 'BANK_TRANSFER', 'CARD', 'ONLINE', 'CHEQUE', 'OTHER'].map((value) => (
                <option key={value} value={value}>
                  {titleCase(value)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="From" htmlFor="pay-filter-from">
            <input
              id="pay-filter-from"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className="h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-ring)]"
            />
          </Field>

          <Field label="To" htmlFor="pay-filter-to">
            <input
              id="pay-filter-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className="h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-ring)]"
            />
          </Field>
        </div>
      </Card>

      <DataTable<PaymentRow>
        columns={columns}
        rows={resource.rows}
        rowKey={(row) => row.id}
        loading={resource.loading}
        searchable
        searchPlaceholder="Search by receipt number, student or reference…"
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
        emptyTitle="No payments recorded"
        emptyDescription="Payments are recorded from an invoice. Open an invoice and choose Record payment."
      />

      <Modal
        open={Boolean(reverseTarget)}
        onClose={() => setReverseTarget(null)}
        title="Reverse this payment?"
        description={
          reverseTarget
            ? `${reverseTarget.receiptNo} · ${formatMoney(Number(reverseTarget.amount))}`
            : ''
        }
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setReverseTarget(null)} disabled={pending}>
              Keep payment
            </Button>
            <Button
              variant="danger"
              onClick={reverse}
              loading={pending}
              disabled={!reverseReason.trim()}
            >
              Reverse payment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="warning" title="This cannot be undone">
            The receipt is voided and the amount is added back to the invoice balance. The original
            record is kept for audit.
          </Alert>

          <Field label="Reason" htmlFor="reverse-reason" required>
            <Textarea
              id="reverse-reason"
              rows={3}
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              placeholder="e.g. Cheque returned unpaid"
            />
          </Field>
        </div>
      </Modal>

      {resource.rows.length === 0 && !resource.loading && (
        <EmptyState
          icon={<Receipt />}
          title="No receipts to show"
          description="Adjust the filters, or record a payment against an invoice."
          className="border-0"
        />
      )}
    </div>
  );
}
