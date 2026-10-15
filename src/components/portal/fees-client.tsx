'use client';

import * as React from 'react';
import { Receipt, Wallet } from 'lucide-react';
import {
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
  TableWrap,
  Td,
  Th,
  Tr,
} from '@/components/ui/structure';
import { Alert, Badge, Button } from '@/components/ui/primitives';
import { ChildSelector, usePortalContext } from './portal-context';
import { api, list } from '@/lib/client-api';

interface InvoiceRow {
  id: string;
  invoiceNo: string;
  status: string;
  issueDate: string;
  dueDate: string;
  totalAmount: number | string;
  amountPaid: number | string;
  balance: number | string;
  student: { id: string; firstName: string; lastName: string; admissionNo: string };
  classSection: { id: string; name: string } | null;
}

interface InvoiceDetail {
  id: string;
  invoiceNo: string;
  status: string;
  issueDate: string;
  dueDate: string;
  subtotal: number | string;
  discountTotal: number | string;
  lateFeeTotal: number | string;
  totalAmount: number | string;
  amountPaid: number | string;
  balance: number | string;
  notes: string | null;
  items: { id: string; head: string; description: string | null; amount: number | string; quantity: number }[];
  payments: {
    id: string;
    receiptNo: string | null;
    amount: number | string;
    method: string;
    status: string;
    paidAt: string;
  }[];
  adjustments: { id: string; type: string; amount: number | string; reason: string | null; createdAt: string }[];
}

interface FeeSummary {
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  totalDiscount: number;
  overdueAmount: number;
  invoiceCount: number;
  openInvoiceCount: number;
}

const STATUS_TONE: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'brand'> = {
  PAID: 'success',
  PARTIAL: 'warning',
  UNPAID: 'danger',
  OVERDUE: 'danger',
  DRAFT: 'info',
  CANCELLED: 'brand',
  REFUNDED: 'brand',
};

function money(value: number | string | null | undefined): string {
  return Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Fee overview for a student or guardian.
 *
 * A guardian whose link forbids fee access sees an explanatory message instead
 * of the figures. The API refuses the request too, so this is a courtesy rather
 * than the security boundary.
 */
export function FeesClient() {
  const context = usePortalContext();
  const [invoices, setInvoices] = React.useState<InvoiceRow[]>([]);
  const [summary, setSummary] = React.useState<FeeSummary | null>(null);
  const [detail, setDetail] = React.useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [denied, setDenied] = React.useState(false);

  const studentId = context.student?.id;

  const load = React.useCallback(async () => {
    if (!studentId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [invoicePage, summaryData] = await Promise.all([
        list<InvoiceRow>('/api/admin/fees', { studentId, pageSize: 100 }),
        api.getOne<FeeSummary>('/api/admin/fees', { scope: 'student', studentId }),
      ]);
      setInvoices(invoicePage.rows);
      setSummary(summaryData);
      setDenied(false);
      setError(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not load fee records.';
      if (/not shared|forbidden/i.test(message)) {
        setDenied(true);
        setError(null);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (invoiceId: string) => {
    try {
      const result = await api.getOne<InvoiceDetail>('/api/admin/fees', {
        scope: 'invoice',
        invoiceId,
      });
      setDetail(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the invoice.');
    }
  };

  if (denied) {
    return (
      <div className="space-y-6">
        <PageHeader title="Fees & invoices" actions={<ChildSelector context={context} />} />
        <Alert tone="warning" title="Fee information is not shared with your account">
          The academy has not granted this guardian account permission to view fee records. Contact the
          academy office if you need access.
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fees & invoices"
        description={
          context.student
            ? `Fee records for ${context.student.firstName} ${context.student.lastName}.`
            : 'Fee records.'
        }
        actions={<ChildSelector context={context} />}
      />

      {error && <Alert tone="danger" title="Could not load fee records">{error}</Alert>}

      {loading && !summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="skeleton h-28 rounded-xl" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total invoiced" value={money(summary.totalInvoiced)} icon={<Receipt />} />
          <StatCard label="Total paid" value={money(summary.totalPaid)} tone="success" />
          <StatCard
            label="Outstanding"
            value={money(summary.totalOutstanding)}
            hint={summary.openInvoiceCount > 0 ? `${summary.openInvoiceCount} open invoice(s)` : 'Nothing open'}
            tone={summary.totalOutstanding > 0 ? 'danger' : 'success'}
          />
          <StatCard
            label="Overdue"
            value={money(summary.overdueAmount)}
            hint={summary.totalDiscount > 0 ? `${money(summary.totalDiscount)} discount applied` : undefined}
            tone={summary.overdueAmount > 0 ? 'danger' : undefined}
          />
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="Invoices"
          description={`${invoices.length} invoice${invoices.length === 1 ? '' : 's'}`}
          icon={<Wallet />}
        />
        {loading ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2].map((index) => (
              <div key={index} className="skeleton h-12 rounded-lg" />
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<Receipt />}
              title="No invoices"
              description="Invoices raised by the academy will appear here with their due dates and balances."
            />
          </div>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th hideBelow="md">Due</Th>
                <Th>Total</Th>
                <Th>Paid</Th>
                <Th>Balance</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <Tr key={invoice.id}>
                  <Td>
                    <span className="tabular text-sm font-medium text-[var(--ink)]">
                      {invoice.invoiceNo}
                    </span>
                    {context.scope === 'parent' && (
                      <span className="ml-2 text-xs text-[var(--ink-subtle)]">
                        {invoice.student.firstName} {invoice.student.lastName}
                      </span>
                    )}
                  </Td>
                  <Td hideBelow="md">
                    <span className="tabular text-sm">
                      {new Date(invoice.dueDate).toLocaleDateString(undefined, {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </Td>
                  <Td>
                    <span className="tabular text-sm">{money(invoice.totalAmount)}</span>
                  </Td>
                  <Td>
                    <span className="tabular text-sm text-[var(--ink-muted)]">
                      {money(invoice.amountPaid)}
                    </span>
                  </Td>
                  <Td>
                    <span
                      className={`tabular text-sm font-medium ${
                        Number(invoice.balance) > 0
                          ? 'text-[var(--danger-soft-ink)]'
                          : 'text-[var(--ink-muted)]'
                      }`}
                    >
                      {money(invoice.balance)}
                    </span>
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[invoice.status] ?? 'brand'}>
                      {invoice.status.toLowerCase()}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => void openDetail(invoice.id)}
                        className="rounded-md px-2 py-1 text-xs font-medium text-[var(--brand-soft-ink)] hover:bg-[var(--surface-hover)]"
                      >
                        Details
                      </button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      {detail && (
        <Card>
          <CardHeader
            title={`Invoice ${detail.invoiceNo}`}
            description={`Issued ${new Date(detail.issueDate).toLocaleDateString()} · due ${new Date(
              detail.dueDate,
            ).toLocaleDateString()}`}
            action={
              <Button variant="ghost" size="sm" onClick={() => setDetail(null)}>
                Close
              </Button>
            }
          />
          <div className="grid gap-5 p-4 sm:grid-cols-2 sm:p-5">
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                Charges
              </h4>
              <ul className="space-y-1">
                {detail.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-4 text-sm">
                    <span className="text-[var(--ink-muted)]">
                      {item.description ?? item.head}
                      {item.quantity > 1 ? ` × ${item.quantity}` : ''}
                    </span>
                    <span className="tabular text-[var(--ink)]">{money(item.amount)}</span>
                  </li>
                ))}
                {detail.items.length === 0 && (
                  <li className="text-sm text-[var(--ink-subtle)]">No itemised charges recorded.</li>
                )}
              </ul>
              <dl className="mt-3 space-y-1 border-t border-[var(--line)] pt-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-[var(--ink-muted)]">Subtotal</dt>
                  <dd className="tabular">{money(detail.subtotal)}</dd>
                </div>
                {Number(detail.discountTotal) > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-[var(--ink-muted)]">Discount</dt>
                    <dd className="tabular text-[var(--ok-soft-ink)]">
                      −{money(detail.discountTotal)}
                    </dd>
                  </div>
                )}
                {Number(detail.lateFeeTotal) > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-[var(--ink-muted)]">Late fee</dt>
                    <dd className="tabular text-[var(--danger-soft-ink)]">
                      +{money(detail.lateFeeTotal)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between font-semibold">
                  <dt className="text-[var(--ink)]">Total</dt>
                  <dd className="tabular text-[var(--ink)]">{money(detail.totalAmount)}</dd>
                </div>
                <div className="flex justify-between font-semibold">
                  <dt className="text-[var(--ink)]">Balance</dt>
                  <dd
                    className={`tabular ${
                      Number(detail.balance) > 0
                        ? 'text-[var(--danger-soft-ink)]'
                        : 'text-[var(--ok-soft-ink)]'
                    }`}
                  >
                    {money(detail.balance)}
                  </dd>
                </div>
              </dl>
            </div>
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                Payments received
              </h4>
              <ul className="space-y-1">
                {detail.payments.map((payment) => (
                  <li key={payment.id} className="flex justify-between gap-4 text-sm">
                    <span className="text-[var(--ink-muted)]">
                      {new Date(payment.paidAt).toLocaleDateString(undefined, {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}{' '}
                      · {payment.method.toLowerCase().replace('_', ' ')}
                      {payment.receiptNo ? ` · ${payment.receiptNo}` : ''}
                    </span>
                    <span className="tabular text-[var(--ink)]">{money(payment.amount)}</span>
                  </li>
                ))}
                {detail.payments.length === 0 && (
                  <li className="text-sm text-[var(--ink-subtle)]">No payments received yet.</li>
                )}
              </ul>

              {detail.adjustments.length > 0 && (
                <>
                  <h4 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                    Adjustments
                  </h4>
                  <ul className="space-y-1">
                    {detail.adjustments.map((adjustment) => (
                      <li key={adjustment.id} className="flex justify-between gap-4 text-sm">
                        <span className="text-[var(--ink-muted)]">
                          {adjustment.type.toLowerCase()}
                          {adjustment.reason ? ` · ${adjustment.reason}` : ''}
                        </span>
                        <span className="tabular text-[var(--ink)]">{money(adjustment.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </Card>
      )}

      <div className="flex justify-end">
        <Button variant="ghost" onClick={() => void load()} loading={loading}>
          Refresh
        </Button>
      </div>
    </div>
  );
}
