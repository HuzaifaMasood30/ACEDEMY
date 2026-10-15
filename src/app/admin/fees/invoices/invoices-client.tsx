'use client';

import * as React from 'react';
import {
  Ban,
  CreditCard,
  FileText,
  Plus,
  RefreshCw,
  Receipt,
  TrendingDown,
  Wand2,
} from 'lucide-react';
import { Alert, Badge, Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Card, CardHeader, EmptyState, PageHeader, StatCard, TableWrap, Td, Th, Tr } from '@/components/ui/structure';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Modal } from '@/components/ui/overlays';
import { api } from '@/lib/client-api';
import { useMutation, useResource } from '@/lib/use-resource';
import { formatDate, formatMoney, formatNumber, titleCase } from '@/lib/format';

interface InvoiceRow {
  id: string;
  invoiceNo: string;
  issueDate: string;
  dueDate: string;
  totalAmount: string;
  amountPaid: string;
  balance: string;
  status: string;
  student: { id: string; firstName: string; lastName: string; admissionNo: string };
  classSection: { id: string; name: string } | null;
  _count: { items: number; payments: number };
}

interface InvoiceDetail {
  id: string;
  invoiceNo: string;
  issueDate: string;
  dueDate: string;
  totalAmount: string;
  amountPaid: string;
  balance: string;
  discountTotal: string;
  subtotal: string;
  lateFeeTotal: string;
  status: string;
  notes: string | null;
  student: { id: string; firstName: string; lastName: string; admissionNo: string };
  items: Array<{
    id: string;
    head: string;
    description: string | null;
    amount: string;
    quantity: number;
  }>;
  payments: Array<{
    id: string;
    receiptNo: string;
    amount: string;
    method: string;
    status: string;
    paidAt: string;
    reference: string | null;
  }>;
  adjustments: Array<{
    id: string;
    type: string;
    amount: string;
    reason: string;
    createdAt: string;
  }>;
}

const STATUS_TONE: Record<string, 'neutral' | 'warning' | 'success' | 'danger' | 'info'> = {
  DRAFT: 'neutral',
  ISSUED: 'info',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  OVERDUE: 'danger',
  CANCELLED: 'neutral',
};

const PAYMENT_METHODS = [
  'CASH',
  'BANK_TRANSFER',
  'CARD',
  'ONLINE_GATEWAY',
  'CHEQUE',
  'ADJUSTMENT',
] as const;

export function InvoicesClient() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [payTarget, setPayTarget] = React.useState<InvoiceDetail | null>(null);
  const [adjustTarget, setAdjustTarget] = React.useState<InvoiceDetail | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<InvoiceDetail | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [generateOpen, setGenerateOpen] = React.useState(false);
  const [payForm, setPayForm] = React.useState({
    amount: '',
    method: 'CASH',
    reference: '',
    paidAt: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [adjustForm, setAdjustForm] = React.useState({
    type: 'DISCOUNT',
    amount: '',
    reason: '',
  });
  const [cancelReason, setCancelReason] = React.useState('');
  const [generateNote, setGenerateNote] = React.useState<string | null>(null);

  const { run, pending } = useMutation();

  const resource = useResource<InvoiceRow>('/api/admin/fees', {
    params: { page, pageSize: 20, q: search, status },
    debounceMs: 250,
  });

  const detail = useResource<InvoiceDetail>('/api/admin/fees', {
    params: { scope: 'student', studentId: '' },
    enabled: false,
  });

  const [invoice, setInvoice] = React.useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);

  const loadDetail = React.useCallback(async () => {
    if (!detailId) {
      setInvoice(null);
      return;
    }
    setDetailLoading(true);
    try {
      const data = await api.getOne<InvoiceDetail>('/api/admin/fees', { scope: 'invoice', invoiceId: detailId });
      setInvoice(data);
    } catch {
      setInvoice(null);
    } finally {
      setDetailLoading(false);
    }
  }, [detailId]);

  React.useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const columns: Column<InvoiceRow>[] = [
    {
      key: 'invoiceNo',
      header: 'Invoice',
      sortable: true,
      cell: (row) => (
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => setDetailId(row.id)}
            className="tabular block truncate text-left text-sm font-medium text-[var(--ink)] hover:text-[var(--brand)]"
          >
            {row.invoiceNo}
          </button>
          <span className="block truncate text-[0.6875rem] text-[var(--ink-subtle)]">
            {row.student.firstName} {row.student.lastName} · {row.student.admissionNo}
          </span>
        </div>
      ),
    },
    {
      key: 'classSection',
      header: 'Class',
      hideBelow: 'lg',
      cell: (row) => (
        <span className="text-xs text-[var(--ink-muted)]">{row.classSection?.name ?? '—'}</span>
      ),
    },
    {
      key: 'dueDate',
      header: 'Due',
      hideBelow: 'md',
      cell: (row) => (
        <div>
          <span className="tabular block text-xs text-[var(--ink-muted)]">
            {formatDate(row.dueDate)}
          </span>
          {row.status === 'OVERDUE' && (
            <span className="block text-[0.6875rem] font-medium text-[var(--danger)]">
              Overdue
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'totalAmount',
      header: 'Total',
      align: 'right',
      cell: (row) => (
        <span className="tabular text-sm">{formatMoney(Number(row.totalAmount))}</span>
      ),
    },
    {
      key: 'amountPaid',
      header: 'Paid',
      align: 'right',
      hideBelow: 'sm',
      cell: (row) => (
        <span className="tabular text-sm text-[var(--ok)]">
          {formatMoney(Number(row.amountPaid))}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      cell: (row) => (
        <span
          className={
            Number(row.balance) > 0
              ? 'tabular text-sm font-semibold text-[var(--danger)]'
              : 'tabular text-sm text-[var(--ink-subtle)]'
          }
        >
          {formatMoney(Number(row.balance))}
        </span>
      ),
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
        <Button variant="ghost" size="sm" onClick={() => setDetailId(row.id)}>
          <Receipt />
          Open
        </Button>
      ),
    },
  ];

  const outstanding = resource.rows.reduce((sum, row) => sum + Number(row.balance), 0);
  const collected = resource.rows.reduce((sum, row) => sum + Number(row.amountPaid), 0);
  const overdue = resource.rows.filter((r) => r.status === 'OVERDUE').length;

  const recordPayment = async () => {
    if (!invoice) return;
    const result = await run(
      () =>
        api.patch('/api/admin/fees', {
          invoiceId: invoice.id,
          amount: Number(payForm.amount),
          method: payForm.method,
          paidAt: payForm.paidAt,
          reference: payForm.reference.trim() || null,
          notes: payForm.notes.trim() || null,
        }),
      { success: 'Payment recorded.' },
    );
    if (result) {
      setPayTarget(null);
      setPayForm((p) => ({ ...p, amount: '', reference: '', notes: '' }));
      await loadDetail();
      resource.reload();
    }
  };

  const applyAdjustment = async () => {
    if (!invoice) return;
    const result = await run(
      () =>
        api.put('/api/admin/fees', {
          action: 'adjust',
          invoiceId: invoice.id,
          type: adjustForm.type,
          amount: Number(adjustForm.amount),
          reason: adjustForm.reason.trim(),
        }),
      { success: 'Adjustment applied.' },
    );
    if (result) {
      setAdjustTarget(null);
      setAdjustForm({ type: 'DISCOUNT', amount: '', reason: '' });
      await loadDetail();
      resource.reload();
    }
  };

  const cancelInvoice = async () => {
    if (!invoice) return;
    const result = await run(
      () =>
        api.put('/api/admin/fees', {
          action: 'cancel',
          invoiceId: invoice.id,
          reason: cancelReason.trim(),
        }),
      { success: 'Invoice cancelled.' },
    );
    if (result) {
      setCancelTarget(null);
      setCancelReason('');
      await loadDetail();
      resource.reload();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Every fee invoice, what has been paid against it and what is still owed."
        breadcrumbs={[{ label: 'Finance' }, { label: 'Invoices' }]}
        actions={
          <>
            <Button variant="outline" onClick={() => setGenerateOpen(true)}>
              <Wand2 />
              Generate for a class
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              New invoice
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Invoices"
          value={formatNumber(resource.meta?.total ?? 0)}
          icon={<FileText />}
          tone="brand"
        />
        <StatCard label="Collected" value={formatMoney(collected)} icon={<CreditCard />} tone="success" />
        <StatCard
          label="Outstanding"
          value={formatMoney(outstanding)}
          icon={<TrendingDown />}
          tone={outstanding > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Overdue"
          value={formatNumber(overdue)}
          icon={<Ban />}
          tone={overdue > 0 ? 'danger' : 'success'}
        />
      </div>

      {resource.error && (
        <Alert tone="danger" title="Could not load invoices">
          {resource.error}
        </Alert>
      )}

      {generateNote && (
        <Alert tone="info" title="Invoice generation finished">
          {generateNote}
        </Alert>
      )}

      <DataTable<InvoiceRow>
        columns={columns}
        rows={resource.rows}
        rowKey={(row) => row.id}
        loading={resource.loading}
        searchable
        searchPlaceholder="Search by invoice number, student name or admission number…"
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
              { value: 'ISSUED', label: 'Issued' },
              { value: 'PARTIALLY_PAID', label: 'Partially paid' },
              { value: 'PAID', label: 'Paid' },
              { value: 'OVERDUE', label: 'Overdue' },
              { value: 'CANCELLED', label: 'Cancelled' },
            ],
          },
        ]}
        filterValues={{ status }}
        onFilterChange={(key, value) => {
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
        emptyTitle="No invoices found"
        emptyDescription="Create an invoice for one student, or generate them for a whole class from a fee structure."
        toolbarExtra={
          <Button variant="outline" size="sm" onClick={resource.reload} loading={resource.refreshing}>
            <RefreshCw />
            Refresh
          </Button>
        }
      />

      <Modal
        open={Boolean(detailId)}
        onClose={() => setDetailId(null)}
        title={invoice ? invoice.invoiceNo : 'Loading…'}
        description={
          invoice
            ? `${invoice.student.firstName} ${invoice.student.lastName} · ${invoice.student.admissionNo}`
            : undefined
        }
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setDetailId(null)}>
              Close
            </Button>
            {invoice && invoice.status !== 'CANCELLED' && (
              <>
                <Button variant="outline" onClick={() => setAdjustTarget(invoice)}>
                  Discount or adjustment
                </Button>
                <Button variant="dangerSoft" onClick={() => setCancelTarget(invoice)}>
                  Cancel invoice
                </Button>
                <Button
                  onClick={() => {
                    setPayTarget(invoice);
                    setPayForm((p) => ({ ...p, amount: String(Number(invoice.balance)) }));
                  }}
                  disabled={Number(invoice.balance) <= 0}
                >
                  <CreditCard />
                  Record payment
                </Button>
              </>
            )}
          </>
        }
      >
        {detailLoading || !invoice ? (
          <div className="py-10 text-center text-sm text-[var(--ink-muted)]">Loading…</div>
        ) : (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ['Status', titleCase(invoice.status)],
                ['Issued', formatDate(invoice.issueDate)],
                ['Due', formatDate(invoice.dueDate)],
                ['Total', formatMoney(Number(invoice.totalAmount))],
                ['Paid', formatMoney(Number(invoice.amountPaid))],
                ['Balance', formatMoney(Number(invoice.balance))],
                ['Discount', formatMoney(Number(invoice.discountTotal))],
                ['Late fee', formatMoney(Number(invoice.lateFeeTotal))],
                ['Subtotal', formatMoney(Number(invoice.subtotal))],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-[var(--ink-subtle)]">{label}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-[var(--ink)]">{value}</dd>
                </div>
              ))}
            </dl>

            {invoice.status === 'CANCELLED' && (
              <Alert tone="warning" title="This invoice is cancelled">
                Cancelled invoices are kept for the audit trail and no longer count towards dues.
              </Alert>
            )}

            {invoice.notes && (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-3.5">
                <p className="text-xs font-medium text-[var(--ink-muted)]">Notes</p>
                <p className="mt-1 text-sm text-[var(--ink)]">{invoice.notes}</p>
              </div>
            )}

            <Card>
              <CardHeader title="Charges" description={`${invoice.items.length} line item(s)`} />
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Head</Th>
                    <Th>Description</Th>
                    <Th align="right">Quantity</Th>
                    <Th align="right">Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item) => (
                    <Tr key={item.id}>
                      <Td className="text-sm text-[var(--ink)]">{item.head}</Td>
                      <Td className="text-xs text-[var(--ink-muted)]">{item.description ?? '—'}</Td>
                      <Td align="right" className="tabular text-sm">
                        {item.quantity}
                      </Td>
                      <Td align="right" className="tabular text-sm">
                        {formatMoney(Number(item.amount))}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableWrap>
            </Card>

            <Card>
              <CardHeader title="Payments" description={`${invoice.payments.length} receipt(s)`} icon={<Receipt />} />
              {invoice.payments.length === 0 ? (
                <EmptyState
                  icon={<Receipt />}
                  title="No payments yet"
                  description="Record a payment to produce a receipt for the guardian."
                  className="border-0"
                />
              ) : (
                <TableWrap>
                  <thead>
                    <tr>
                      <Th>Receipt</Th>
                      <Th>Method</Th>
                      <Th>Paid</Th>
                      <Th>Reference</Th>
                      <Th align="right">Amount</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.payments.map((payment) => (
                      <Tr key={payment.id}>
                        <Td className="tabular text-xs text-[var(--ink)]">{payment.receiptNo}</Td>
                        <Td className="text-xs text-[var(--ink-muted)]">
                          {titleCase(payment.method)}
                        </Td>
                        <Td className="tabular text-xs text-[var(--ink-muted)]">
                          {formatDate(payment.paidAt)}
                        </Td>
                        <Td className="text-xs text-[var(--ink-muted)]">{payment.reference ?? '—'}</Td>
                        <Td align="right" className="tabular text-sm">
                          {formatMoney(Number(payment.amount))}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </TableWrap>
              )}
            </Card>

            {invoice.adjustments.length > 0 && (
              <Card>
                <CardHeader title="Adjustments" description={`${invoice.adjustments.length} entr(ies)`} />
                <TableWrap>
                  <thead>
                    <tr>
                      <Th>Type</Th>
                      <Th>Reason</Th>
                      <Th>Date</Th>
                      <Th align="right">Amount</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.adjustments.map((adjustment) => (
                      <Tr key={adjustment.id}>
                        <Td>
                          <Badge tone={adjustment.type === 'DISCOUNT' ? 'success' : 'warning'}>
                            {titleCase(adjustment.type)}
                          </Badge>
                        </Td>
                        <Td className="max-w-[18rem] truncate text-xs text-[var(--ink-muted)]">
                          {adjustment.reason}
                        </Td>
                        <Td className="tabular text-xs text-[var(--ink-muted)]">
                          {formatDate(adjustment.createdAt)}
                        </Td>
                        <Td align="right" className="tabular text-sm">
                          {formatMoney(Number(adjustment.amount))}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </TableWrap>
              </Card>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(payTarget)}
        onClose={() => setPayTarget(null)}
        title="Record a payment"
        description={payTarget ? `Outstanding balance ${formatMoney(Number(payTarget.balance))}` : ''}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setPayTarget(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              onClick={recordPayment}
              loading={pending}
              disabled={!payForm.amount || Number(payForm.amount) <= 0}
            >
              Record payment
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount" htmlFor="pay-amount" required hint="Partial payments are allowed.">
            <Input
              id="pay-amount"
              type="number"
              min="0.01"
              step="0.01"
              value={payForm.amount}
              onChange={(e) => setPayForm((p) => ({ ...p, amount: e.target.value }))}
            />
          </Field>

          <Field label="Method" htmlFor="pay-method" required>
            <Select
              id="pay-method"
              value={payForm.method}
              onChange={(e) => setPayForm((p) => ({ ...p, method: e.target.value }))}
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {titleCase(method)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Paid on" htmlFor="pay-date" required>
            <Input
              id="pay-date"
              type="date"
              value={payForm.paidAt}
              onChange={(e) => setPayForm((p) => ({ ...p, paidAt: e.target.value }))}
            />
          </Field>

          <Field label="Reference" htmlFor="pay-reference" hint="Bank slip or transaction number.">
            <Input
              id="pay-reference"
              value={payForm.reference}
              onChange={(e) => setPayForm((p) => ({ ...p, reference: e.target.value }))}
            />
          </Field>

          <Field label="Notes" htmlFor="pay-notes" className="sm:col-span-2">
            <Textarea
              id="pay-notes"
              rows={2}
              value={payForm.notes}
              onChange={(e) => setPayForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(adjustTarget)}
        onClose={() => setAdjustTarget(null)}
        title="Apply a discount or adjustment"
        description="Adjustments are recorded in the audit log with a reason."
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setAdjustTarget(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              onClick={applyAdjustment}
              loading={pending}
              disabled={!adjustForm.amount || !adjustForm.reason.trim()}
            >
              Apply
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Type" htmlFor="adj-type" required>
            <Select
              id="adj-type"
              value={adjustForm.type}
              onChange={(e) => setAdjustForm((p) => ({ ...p, type: e.target.value }))}
            >
              <option value="DISCOUNT">Discount</option>
              <option value="SCHOLARSHIP">Scholarship</option>
              <option value="CONCESSION">Concession</option>
              <option value="WAIVER">Waiver</option>
              <option value="LATE_FEE">Late fee</option>
              <option value="CORRECTION">Correction</option>
            </Select>
          </Field>

          <Field label="Amount" htmlFor="adj-amount" required>
            <Input
              id="adj-amount"
              type="number"
              min="0.01"
              step="0.01"
              value={adjustForm.amount}
              onChange={(e) => setAdjustForm((p) => ({ ...p, amount: e.target.value }))}
            />
          </Field>

          <Field
            label="Reason"
            htmlFor="adj-reason"
            required
            hint="Shown in the audit log and on the invoice."
          >
            <Textarea
              id="adj-reason"
              rows={2}
              value={adjustForm.reason}
              onChange={(e) => setAdjustForm((p) => ({ ...p, reason: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="Cancel this invoice?"
        description={
          cancelTarget
            ? `${cancelTarget.invoiceNo} will stop counting towards dues. The record is kept for audit.`
            : undefined
        }
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={pending}>
              Keep invoice
            </Button>
            <Button
              variant="danger"
              onClick={cancelInvoice}
              loading={pending}
              disabled={!cancelReason.trim()}
            >
              Cancel invoice
            </Button>
          </>
        }
      >
        <Field label="Reason" htmlFor="cancel-reason" required hint="Recorded in the audit log.">
          <Textarea
            id="cancel-reason"
            rows={3}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
        </Field>
      </Modal>

      <CreateInvoiceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        pending={pending}
        onSubmit={async (payload) => {
          const result = await run(() => api.post('/api/admin/fees', payload), {
            success: 'Invoice created.',
          });
          if (result) {
            setCreateOpen(false);
            resource.reload();
          }
        }}
      />

      <GenerateInvoicesModal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        pending={pending}
        onSubmit={async (payload) => {
          const result = await run<{
            created: Array<{ studentId: string }>;
            skipped: Array<{ studentId: string; reason: string }>;
            total: number;
          }>(() => api.put('/api/admin/fees', payload), {
            success: 'Invoices generated.',
          });
          if (result) {
            setGenerateOpen(false);
            resource.reload();
            if (result.created.length === 0 && result.skipped.length > 0) {
              setGenerateNote(
                `No new invoices were created: all ${result.skipped.length} student(s) already have an active invoice for this period.`,
              );
            } else {
              setGenerateNote(
                `Created ${result.created.length} invoice(s), skipped ${result.skipped.length}.`,
              );
            }
          }
        }}
      />
    </div>
  );
}

function CreateInvoiceModal({
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
  const [studentSearch, setStudentSearch] = React.useState('');
  const [students, setStudents] = React.useState<
    Array<{ id: string; admissionNo: string; firstName: string; lastName: string }>
  >([]);
  const [student, setStudent] = React.useState<{
    id: string;
    admissionNo: string;
    firstName: string;
    lastName: string;
  } | null>(null);
  const [form, setForm] = React.useState({
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    notes: '',
  });
  const [items, setItems] = React.useState([
    { head: 'Tuition Fee', description: '', amount: '' },
  ]);
  const [discount, setDiscount] = React.useState({ type: 'DISCOUNT', amount: '', reason: '' });

  React.useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      api
        .getOne<{ rows: typeof students }>('/api/admin/students', {
          pageSize: 20,
          q: studentSearch,
          status: 'ACTIVE',
        })
        .then((data) => setStudents(data.rows ?? []))
        .catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, studentSearch]);

  const total = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const discountAmount = Number(discount.amount) || 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New invoice"
      description="Issue a fee invoice to a single student."
      size="lg"
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            loading={pending}
            disabled={!student || items.every((item) => !item.head.trim() || !item.amount)}
            onClick={async () => {
              if (!student) return;
              await onSubmit({
                studentId: student.id,
                issueDate: form.issueDate,
                dueDate: form.dueDate,
                notes: form.notes.trim() || null,
                items: items
                  .filter((item) => item.head.trim() && item.amount)
                  .map((item) => ({
                    head: item.head.trim(),
                    description: item.description.trim() || null,
                    unitAmount: Number(item.amount),
                    quantity: 1,
                  })),
                discount:
                  discountAmount > 0 && discount.reason.trim()
                    ? {
                        type: discount.type,
                        amount: discountAmount,
                        reason: discount.reason.trim(),
                      }
                    : null,
              });
            }}
          >
            Create invoice
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!student ? (
          <>
            <Field label="Find the student" htmlFor="inv-student-search" required>
              <Input
                id="inv-student-search"
                type="search"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Search by name or admission number…"
              />
            </Field>

            <div className="scrollbar-slim max-h-48 overflow-y-auto rounded-md border border-[var(--line)]">
              {students.length === 0 ? (
                <p className="p-4 text-sm text-[var(--ink-subtle)]">No active students matched.</p>
              ) : (
                <ul className="divide-y divide-[var(--line)]">
                  {students.map((option) => (
                    <li key={option.id}>
                      <button
                        type="button"
                        onClick={() => setStudent(option)}
                        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left hover:bg-[var(--surface-hover)]"
                      >
                        <span className="text-sm text-[var(--ink)]">
                          {option.firstName} {option.lastName}
                        </span>
                        <span className="tabular text-xs text-[var(--ink-subtle)]">
                          {option.admissionNo}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3.5 py-2.5">
              <div>
                <p className="text-sm font-medium text-[var(--ink)]">
                  {student.firstName} {student.lastName}
                </p>
                <p className="tabular text-xs text-[var(--ink-subtle)]">{student.admissionNo}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStudent(null)}>
                Change
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Issue date" htmlFor="inv-issue" required>
                <Input
                  id="inv-issue"
                  type="date"
                  value={form.issueDate}
                  onChange={(e) => setForm((p) => ({ ...p, issueDate: e.target.value }))}
                />
              </Field>

              <Field label="Due date" htmlFor="inv-due" required>
                <Input
                  id="inv-due"
                  type="date"
                  min={form.issueDate}
                  value={form.dueDate}
                  onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
                />
              </Field>
            </div>

            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-2 gap-2 sm:grid-cols-12">
                  <Field label="Charge head" htmlFor={`inv-head-${index}`} className="sm:col-span-5">
                    <Input
                      id={`inv-head-${index}`}
                      value={item.head}
                      onChange={(e) =>
                        setItems((p) =>
                          p.map((it, i) => (i === index ? { ...it, head: e.target.value } : it)),
                        )
                      }
                    />
                  </Field>

                  <Field label="Amount" htmlFor={`inv-amount-${index}`} className="sm:col-span-3">
                    <Input
                      id={`inv-amount-${index}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.amount}
                      onChange={(e) =>
                        setItems((p) =>
                          p.map((it, i) => (i === index ? { ...it, amount: e.target.value } : it)),
                        )
                      }
                    />
                  </Field>

                  <Field label="Description" htmlFor={`inv-desc-${index}`} className="col-span-2 sm:col-span-4">
                    <Input
                      id={`inv-desc-${index}`}
                      value={item.description}
                      onChange={(e) =>
                        setItems((p) =>
                          p.map((it, i) =>
                            i === index ? { ...it, description: e.target.value } : it,
                          ),
                        )
                      }
                    />
                  </Field>
                </div>
              ))}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setItems((p) => [...p, { head: '', description: '', amount: '' }])}
              >
                <Plus />
                Add charge
              </Button>
            </div>

            <div className="rounded-lg border border-[var(--line)] p-3.5">
              <p className="text-xs font-medium text-[var(--ink-muted)]">Optional discount</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <Select
                  value={discount.type}
                  onChange={(e) => setDiscount((p) => ({ ...p, type: e.target.value }))}
                  aria-label="Discount type"
                >
                  <option value="DISCOUNT">Fixed discount</option>
                  <option value="SCHOLARSHIP">Scholarship</option>
                  <option value="CONCESSION">Concession</option>
                  <option value="WAIVER">Waiver</option>
                </Select>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discount.amount}
                  onChange={(e) => setDiscount((p) => ({ ...p, amount: e.target.value }))}
                  placeholder={discount.type === 'PERCENT' ? 'Percent' : 'Amount'}
                  aria-label="Discount amount"
                />
                <Input
                  value={discount.reason}
                  onChange={(e) => setDiscount((p) => ({ ...p, reason: e.target.value }))}
                  placeholder="Reason"
                  aria-label="Discount reason"
                />
              </div>
            </div>

            <Field label="Notes" htmlFor="inv-notes">
              <Textarea
                id="inv-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </Field>

            <div className="flex justify-between rounded-lg bg-[var(--surface-sunken)] px-3.5 py-2.5 text-sm">
              <span className="text-[var(--ink-muted)]">Invoice total</span>
              <span className="tabular font-semibold text-[var(--ink)]">
                {formatMoney(Math.max(0, total - discountAmount))}
              </span>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function GenerateInvoicesModal({
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
  const [classes, setClasses] = React.useState<Array<{ id: string; name: string }>>([]);
  const [structures, setStructures] = React.useState<Array<{ id: string; name: string }>>([]);
  const [sessions, setSessions] = React.useState<Array<{ id: string; name: string }>>([]);
  const [form, setForm] = React.useState({
    classSectionId: '',
    feeStructureId: '',
    academicSessionId: '',
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
  });

  React.useEffect(() => {
    if (!open) return;
    Promise.all([
      api.getOne<{ rows: Array<{ id: string; name: string }> }>('/api/admin/classes', { pageSize: 200 }),
      api.getOne<{ structures: Array<{ id: string; name: string }> }>('/api/admin/fees/structures'),
      api.getOne<{ sessions: Array<{ id: string; name: string; isCurrent: boolean }> }>(
        '/api/admin/sessions',
      ),
    ])
      .then(([classData, structureData, sessionData]) => {
        setClasses(classData.rows ?? []);
        setStructures(structureData.structures ?? []);
        setSessions(sessionData.sessions ?? []);
        const current = sessionData.sessions?.find((s) => s.isCurrent) ?? sessionData.sessions?.[0];
        setForm((p) => ({
          ...p,
          academicSessionId: current?.id ?? '',
          classSectionId: classData.rows?.[0]?.id ?? '',
          feeStructureId: structureData.structures?.[0]?.id ?? '',
        }));
      })
      .catch(() => undefined);
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate invoices for a class"
      description="Creates one invoice per actively enrolled student from the selected fee structure."
      size="md"
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            loading={pending}
            disabled={!form.classSectionId || !form.feeStructureId || !form.academicSessionId}
            onClick={() =>
              onSubmit({
                action: 'generateClass',
                classSectionId: form.classSectionId,
                feeStructureId: form.feeStructureId,
                academicSessionId: form.academicSessionId,
                issueDate: form.issueDate,
                dueDate: form.dueDate,
              })
            }
          >
            Generate invoices
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Alert tone="info">
          Students who already have an invoice from this structure for the same period are skipped, so
          running this twice does not double-charge anyone.
        </Alert>

        <Field label="Class" htmlFor="gen-class" required>
          <Select
            id="gen-class"
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

        <Field label="Fee structure" htmlFor="gen-structure" required>
          <Select
            id="gen-structure"
            value={form.feeStructureId}
            onChange={(e) => setForm((p) => ({ ...p, feeStructureId: e.target.value }))}
          >
            <option value="">Choose a structure…</option>
            {structures.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Academic session" htmlFor="gen-session" required>
          <Select
            id="gen-session"
            value={form.academicSessionId}
            onChange={(e) => setForm((p) => ({ ...p, academicSessionId: e.target.value }))}
          >
            <option value="">Choose a session…</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Issue date" htmlFor="gen-issue" required>
            <Input
              id="gen-issue"
              type="date"
              value={form.issueDate}
              onChange={(e) => setForm((p) => ({ ...p, issueDate: e.target.value }))}
            />
          </Field>

          <Field label="Due date" htmlFor="gen-due" required>
            <Input
              id="gen-due"
              type="date"
              min={form.issueDate}
              value={form.dueDate}
              onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
            />
          </Field>
        </div>

        {structures.length === 0 && (
          <Alert tone="warning" title="No fee structures defined">
            Create a fee structure first, then generate invoices from it.
          </Alert>
        )}
      </div>
    </Modal>
  );
}

export { formatNumber };
