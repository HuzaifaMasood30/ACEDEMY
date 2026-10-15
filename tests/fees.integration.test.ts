import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  createInvoice,
  recordPayment,
  studentFeeSummary,
  round2,
} from '@/server/services/fees';

/**
 * Fee arithmetic runs against the real database.
 *
 * These tests create their own students and invoices under a reserved
 * admission-number prefix, then delete them, so the seeded demonstration data
 * is never disturbed.
 */

const prisma = new PrismaClient();
const PREFIX = 'VITEST-';
const createdStudentIds: string[] = [];

/**
 * Invoice fixtures sit in the future. A past due date correctly attracts the
 * configured late fee, which would obscure the arithmetic under test, so every
 * fixture is anchored well ahead of the current date.
 */
const DAY = 86_400_000;
const FUTURE_ISSUE = () => new Date(Date.now() + 30 * DAY);
const FUTURE_DUE = () => new Date(Date.now() + 60 * DAY);
/** Far enough past the grace period that the late fee must apply. */
const PAST_DUE = () => new Date(Date.now() - 90 * DAY);
const PAST_ISSUE = () => new Date(Date.now() - 120 * DAY);

let adminUserId: string;

async function makeStudent(label: string) {
  const student = await prisma.student.create({
    data: {
      admissionNo: `${PREFIX}${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      firstName: 'Vitest',
      lastName: label,
      status: 'ACTIVE',
      admissionDate: new Date(),
    },
  });
  createdStudentIds.push(student.id);
  return student;
}

beforeAll(async () => {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) throw new Error('Seed data is missing an administrator account.');
  adminUserId = admin.id;
});

afterAll(async () => {
  // Remove only what this suite created, children first.
  await prisma.payment.deleteMany({ where: { studentId: { in: createdStudentIds } } });
  await prisma.feeAdjustment.deleteMany({
    where: { invoice: { studentId: { in: createdStudentIds } } },
  });
  await prisma.invoiceItem.deleteMany({
    where: { invoice: { studentId: { in: createdStudentIds } } },
  });
  await prisma.invoice.deleteMany({ where: { studentId: { in: createdStudentIds } } });
  await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
  await prisma.$disconnect();
});

describe('round2', () => {
  it('rounds half away from zero at two decimals', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});

describe('createInvoice', () => {
  it('computes subtotal, total and balance from the item list', async () => {
    const student = await makeStudent('INV');
    const invoice = await createInvoice({
      studentId: student.id,
      issueDate: FUTURE_ISSUE(),
      dueDate: FUTURE_DUE(),
      items: [
        { head: 'Tuition', unitAmount: 5000, quantity: 1 },
        { head: 'Exam fee', unitAmount: 500, quantity: 2 },
      ],
      createdByUserId: adminUserId,
    });

    expect(Number(invoice.subtotal)).toBe(6000);
    expect(Number(invoice.totalAmount)).toBe(6000);
    expect(Number(invoice.balance)).toBe(6000);
    expect(Number(invoice.amountPaid)).toBe(0);
  });

  it('applies a discount before the total', async () => {
    const student = await makeStudent('DISC');
    const invoice = await createInvoice({
      studentId: student.id,
      issueDate: FUTURE_ISSUE(),
      dueDate: FUTURE_DUE(),
      items: [{ head: 'Tuition', unitAmount: 10000, quantity: 1 }],
      discount: { type: 'SCHOLARSHIP', amount: 2500, reason: 'Merit award' },
      createdByUserId: adminUserId,
    });

    expect(Number(invoice.discountTotal)).toBe(2500);
    expect(Number(invoice.totalAmount)).toBe(7500);
    expect(Number(invoice.balance)).toBe(7500);
  });

  it('rejects an invoice with no charges', async () => {
    const student = await makeStudent('EMPTY');
    await expect(
      createInvoice({
        studentId: student.id,
        issueDate: FUTURE_ISSUE(),
        dueDate: FUTURE_DUE(),
        items: [],
        createdByUserId: adminUserId,
      }),
    ).rejects.toThrow(/at least one charge/i);
  });

  it('rejects a due date before the issue date', async () => {
    const student = await makeStudent('DATES');
    await expect(
      createInvoice({
        studentId: student.id,
        issueDate: FUTURE_DUE(),
        dueDate: FUTURE_ISSUE(),
        items: [{ head: 'Tuition', unitAmount: 100 }],
        createdByUserId: adminUserId,
      }),
    ).rejects.toThrow(/due date/i);
  });

  it('rejects a negative charge', async () => {
    const student = await makeStudent('NEG');
    await expect(
      createInvoice({
        studentId: student.id,
        issueDate: FUTURE_ISSUE(),
        dueDate: FUTURE_DUE(),
        items: [{ head: 'Refund', unitAmount: -500 }],
        createdByUserId: adminUserId,
      }),
    ).rejects.toThrow(/negative/i);
  });

  it('issues a unique invoice number', async () => {
    const a = await makeStudent('NOA');
    const b = await makeStudent('NOB');
    const base = {
      issueDate: FUTURE_ISSUE(),
      dueDate: FUTURE_DUE(),
      items: [{ head: 'Tuition', unitAmount: 100 }],
      createdByUserId: adminUserId,
    };
    const first = await createInvoice({ ...base, studentId: a.id });
    const second = await createInvoice({ ...base, studentId: b.id });
    expect(first.invoiceNo).not.toBe(second.invoiceNo);
  });
});

describe('recordPayment', () => {
  async function invoiceOf(amount: number, dueDate = FUTURE_DUE()) {
    const student = await makeStudent('PAY');
    const invoice = await createInvoice({
      studentId: student.id,
      issueDate: FUTURE_ISSUE(),
      dueDate,
      items: [{ head: 'Tuition', unitAmount: amount }],
      createdByUserId: adminUserId,
    });
    return invoice;
  }

  it('accepts a partial payment and leaves the remainder outstanding', async () => {
    const invoice = await invoiceOf(1000);
    const result = await recordPayment({
      invoiceId: invoice.id,
      amount: 400,
      method: 'CASH',
      recordedByUserId: adminUserId,
    });

    expect(Number(result.invoice.amountPaid)).toBe(400);
    expect(Number(result.invoice.balance)).toBe(600);
    expect(result.invoice.status).toBe('PARTIALLY_PAID');
  });

  it('marks the invoice paid when the balance reaches zero', async () => {
    const invoice = await invoiceOf(1000);
    const result = await recordPayment({
      invoiceId: invoice.id,
      amount: 1000,
      method: 'BANK_TRANSFER',
      recordedByUserId: adminUserId,
    });

    expect(Number(result.invoice.balance)).toBe(0);
    expect(result.invoice.status).toBe('PAID');
  });

  it('settles to zero across several partial payments', async () => {
    const invoice = await invoiceOf(1000);
    await recordPayment({ invoiceId: invoice.id, amount: 333.33, method: 'CASH', recordedByUserId: adminUserId });
    await recordPayment({ invoiceId: invoice.id, amount: 333.33, method: 'CASH', recordedByUserId: adminUserId });
    const last = await recordPayment({
      invoiceId: invoice.id,
      amount: 333.34,
      method: 'CASH',
      recordedByUserId: adminUserId,
    });

    expect(Number(last.invoice.amountPaid)).toBe(1000);
    expect(Number(last.invoice.balance)).toBe(0);
    expect(last.invoice.status).toBe('PAID');
  });

  it('rejects an overpayment', async () => {
    const invoice = await invoiceOf(500);
    await expect(
      recordPayment({ invoiceId: invoice.id, amount: 600, method: 'CASH', recordedByUserId: adminUserId }),
    ).rejects.toThrow(/exceeds the outstanding balance/i);
  });

  it('rejects a zero or negative payment', async () => {
    const invoice = await invoiceOf(500);
    await expect(
      recordPayment({ invoiceId: invoice.id, amount: 0, method: 'CASH', recordedByUserId: adminUserId }),
    ).rejects.toThrow(/greater than zero/i);
    await expect(
      recordPayment({ invoiceId: invoice.id, amount: -100, method: 'CASH', recordedByUserId: adminUserId }),
    ).rejects.toThrow(/greater than zero/i);
  });

  it('refuses further payments on a cancelled invoice', async () => {
    const invoice = await invoiceOf(500);
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'CANCELLED' },
    });
    await expect(
      recordPayment({ invoiceId: invoice.id, amount: 100, method: 'CASH', recordedByUserId: adminUserId }),
    ).rejects.toThrow(/cancelled/i);
  });

  it('gives every payment a unique receipt number', async () => {
    const invoice = await invoiceOf(1000);
    const first = await recordPayment({ invoiceId: invoice.id, amount: 100, method: 'CASH', recordedByUserId: adminUserId });
    const second = await recordPayment({ invoiceId: invoice.id, amount: 100, method: 'CASH', recordedByUserId: adminUserId });
    expect(first.payment.receiptNo).not.toBe(second.payment.receiptNo);
  });

  it('serialises concurrent payments so the invoice cannot be overpaid', async () => {
    // Two payments of 600 against a 1000 invoice: at most one may succeed, and
    // whichever ordering occurs the balance must never go negative.
    const invoice = await invoiceOf(1000);

    const results = await Promise.allSettled([
      recordPayment({ invoiceId: invoice.id, amount: 600, method: 'CASH', recordedByUserId: adminUserId }),
      recordPayment({ invoiceId: invoice.id, amount: 600, method: 'CASH', recordedByUserId: adminUserId }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBe(1);

    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(Number(after.amountPaid)).toBe(600);
    expect(Number(after.balance)).toBe(400);
    expect(Number(after.balance)).toBeGreaterThanOrEqual(0);
  });
});

describe('studentFeeSummary', () => {
  it('totals invoiced, paid, outstanding and discount', async () => {
    const student = await makeStudent('SUM');
    const base = {
      studentId: student.id,
      issueDate: FUTURE_ISSUE(),
      dueDate: FUTURE_DUE(),
      createdByUserId: adminUserId,
    };

    await createInvoice({
      ...base,
      items: [{ head: 'Tuition', unitAmount: 1000 }],
      discount: { type: 'CONCESSION', amount: 100 },
    });
    const second = await createInvoice({
      ...base,
      items: [{ head: 'Transport', unitAmount: 500 }],
    });
    await recordPayment({
      invoiceId: second.id,
      amount: 200,
      method: 'CASH',
      recordedByUserId: adminUserId,
    });

    const summary = await studentFeeSummary(student.id);
    // `totalInvoiced` is the sum of each invoice's total, which is already net
    // of any discount, so it is 900 + 500 rather than the 1500 gross subtotal.
    // The discount is reported separately for transparency.
    expect(summary.totalInvoiced).toBe(1400);
    expect(summary.totalDiscount).toBe(100);
    expect(summary.totalPaid).toBe(200);
    expect(summary.totalOutstanding).toBe(1200);
    expect(summary.invoiceCount).toBe(2);
    expect(summary.openInvoiceCount).toBe(2);
  });

  it('reports zero for a student with no invoices', async () => {
    const student = await makeStudent('NONE');
    const summary = await studentFeeSummary(student.id);
    expect(summary.totalInvoiced).toBe(0);
    expect(summary.totalPaid).toBe(0);
    expect(summary.totalOutstanding).toBe(0);
    expect(summary.invoiceCount).toBe(0);
  });

  it('applies the configured late fee to an overdue invoice', async () => {
    const student = await makeStudent('OVER');
    const invoice = await createInvoice({
      studentId: student.id,
      issueDate: PAST_ISSUE(),
      dueDate: PAST_DUE(),
      items: [{ head: 'Tuition', unitAmount: 750 }],
      createdByUserId: adminUserId,
    });

    // The seeded rules charge a flat 500 once the grace period has elapsed, so
    // the outstanding balance is the charge plus the late fee.
    const rules = await prisma.setting.findUnique({ where: { key: 'academy.fee_rules' } });
    const lateFee = (rules?.value as { lateFeeAmount?: number } | null)?.lateFeeAmount ?? 0;
    expect(lateFee).toBeGreaterThan(0);
    expect(Number(invoice.lateFeeTotal)).toBe(lateFee);
    expect(Number(invoice.balance)).toBe(750 + lateFee);

    const summary = await studentFeeSummary(student.id);
    expect(summary.overdueAmount).toBe(750 + lateFee);
    expect(summary.totalOutstanding).toBe(750 + lateFee);
  });
});
