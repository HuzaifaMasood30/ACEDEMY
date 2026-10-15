import { prisma } from '@/lib/prisma';
import { conflict, notFound, validationError } from '@/lib/errors';
import {
  AdjustmentType,
  FeeFrequency,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  type Prisma,
} from '@prisma/client';
import { getFeeRules } from '@/server/settings';

/** Decimal-safe rounding to two places, avoiding float drift on money. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toNumber(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number(value.toString());
}

// ---------------------------------------------------------------------------
// Invoice numbering
// ---------------------------------------------------------------------------

/**
 * Allocate the next sequential number for a prefix.
 *
 * Uses a dedicated counter row updated inside the caller's transaction, so two
 * concurrent invoice creations cannot produce the same number.
 */
async function nextSequence(
  tx: Prisma.TransactionClient,
  prefix: string,
  period: string,
): Promise<string> {
  const key = `${prefix}-${period}`;

  const counter = await tx.setting.upsert({
    where: { key: `sequence:${key}` },
    create: { key: `sequence:${key}`, value: { last: 0 }, category: 'sequence' },
    update: {},
  });

  const current = counter.value as { last?: number };
  const next = (current.last ?? 0) + 1;

  await tx.setting.update({
    where: { key: `sequence:${key}` },
    data: { value: { last: next } },
  });

  return `${prefix}-${period}-${String(next).padStart(5, '0')}`;
}

function periodKey(date: Date): string {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Invoice creation
// ---------------------------------------------------------------------------

export interface InvoiceItemInput {
  head: string;
  description?: string | null;
  quantity?: number;
  unitAmount: number;
}

export interface CreateInvoiceInput {
  studentId: string;
  academicSessionId?: string | null;
  termId?: string | null;
  classSectionId?: string | null;
  issueDate: Date;
  dueDate: Date;
  items: InvoiceItemInput[];
  /** Applied before any late fee; recorded as a FeeAdjustment. */
  discount?: { type: AdjustmentType; amount: number; reason?: string } | null;
  notes?: string | null;
  createdByUserId: string;
}

/**
 * Create an invoice with its line items and any opening adjustment.
 *
 * Subtotal, total and balance are computed here from the item list rather than
 * accepted from the client, so a tampered request cannot understate a charge.
 */
export async function createInvoice(input: CreateInvoiceInput) {
  if (input.items.length === 0) {
    throw validationError('An invoice needs at least one charge.');
  }
  if (input.dueDate.getTime() < input.issueDate.getTime()) {
    throw validationError('The due date cannot be before the issue date.');
  }

  for (const item of input.items) {
    if (item.unitAmount < 0) {
      throw validationError(`Charge "${item.head}" cannot have a negative amount.`);
    }
  }

  const student = await prisma.student.findUnique({
    where: { id: input.studentId },
    select: { id: true, status: true, admissionNo: true },
  });

  if (!student) throw notFound('Student not found.');

  const rules = await getFeeRules();

  const subtotal = round2(
    input.items.reduce(
      (sum, item) => sum + round2(item.unitAmount * (item.quantity ?? 1)),
      0,
    ),
  );

  const discountAmount = round2(input.discount?.amount ?? 0);

  if (discountAmount > subtotal) {
    throw validationError('The discount cannot exceed the invoice subtotal.');
  }

  const totalAmount = round2(subtotal - discountAmount);
  const lateFee = await computeLateFee(input.dueDate, totalAmount, rules);

  return prisma.$transaction(async (tx) => {
    const invoiceNo = await nextSequence(tx, rules.invoicePrefix, periodKey(input.issueDate));

    const invoice = await tx.invoice.create({
      data: {
        invoiceNo,
        studentId: input.studentId,
        academicSessionId: input.academicSessionId ?? null,
        termId: input.termId ?? null,
        classSectionId: input.classSectionId ?? null,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        subtotal,
        discountTotal: discountAmount,
        lateFeeTotal: lateFee,
        totalAmount: round2(totalAmount + lateFee),
        amountPaid: 0,
        balance: round2(totalAmount + lateFee),
        status: InvoiceStatus.ISSUED,
        notes: input.notes ?? null,
        createdByUserId: input.createdByUserId,
        items: {
          create: input.items.map((item) => {
            const quantity = item.quantity ?? 1;
            return {
              head: item.head,
              description: item.description ?? null,
              quantity,
              unitAmount: round2(item.unitAmount),
              amount: round2(item.unitAmount * quantity),
            };
          }),
        },
      },
      include: { items: true },
    });

    if (discountAmount > 0 && input.discount) {
      await tx.feeAdjustment.create({
        data: {
          invoiceId: invoice.id,
          studentId: input.studentId,
          type: input.discount.type,
          amount: discountAmount,
          reason: input.discount.reason ?? null,
          authorizedByUserId: input.createdByUserId,
        },
      });
    }

    return invoice;
  });
}

async function computeLateFee(
  dueDate: Date,
  baseAmount: number,
  rules: { lateFeeAmount: number; lateFeeIsPercentage: boolean; lateFeeGraceDays: number },
): Promise<number> {
  if (rules.lateFeeAmount <= 0) return 0;

  const graceEnd = new Date(dueDate.getTime() + rules.lateFeeGraceDays * 86_400_000);
  if (Date.now() <= graceEnd.getTime()) return 0;

  return round2(
    rules.lateFeeIsPercentage ? (baseAmount * rules.lateFeeAmount) / 100 : rules.lateFeeAmount,
  );
}

/**
 * Generate invoices for a whole class from its fee structure.
 *
 * Each invoice is created in its own transaction so one failure does not abort
 * the batch, and the returned summary reports exactly what succeeded.
 */
export async function generateClassInvoices(options: {
  classSectionId: string;
  feeStructureId: string;
  issueDate: Date;
  dueDate: Date;
  academicSessionId?: string | null;
  termId?: string | null;
  createdByUserId: string;
  skipExisting?: boolean;
}) {
  const structure = await prisma.feeStructure.findUnique({
    where: { id: options.feeStructureId },
    include: { items: true },
  });

  if (!structure) throw notFound('Fee structure not found.');
  if (structure.items.length === 0) {
    throw validationError('This fee structure has no charges defined.');
  }

  const enrollments = await prisma.enrollment.findMany({
    where: { classSectionId: options.classSectionId, status: 'ACTIVE' },
    select: { studentId: true },
  });

  const created: string[] = [];
  const skipped: { studentId: string; reason: string }[] = [];

  for (const { studentId } of enrollments) {
    if (options.skipExisting) {
      const existing = await prisma.invoice.findFirst({
        where: {
          studentId,
          classSectionId: options.classSectionId,
          status: { notIn: [InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED] },
        },
        select: { id: true },
      });

      if (existing) {
        skipped.push({ studentId, reason: 'An active invoice already exists.' });
        continue;
      }
    }

    try {
      const invoice = await createInvoice({
        studentId,
        academicSessionId: options.academicSessionId ?? null,
        termId: options.termId ?? null,
        classSectionId: options.classSectionId,
        issueDate: options.issueDate,
        dueDate: options.dueDate,
        items: structure.items.map((item) => ({
          head: item.head,
          description: item.description,
          quantity: 1,
          unitAmount: toNumber(item.amount),
        })),
        createdByUserId: options.createdByUserId,
      });
      created.push(invoice.id);
    } catch (error) {
      skipped.push({
        studentId,
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return { created, skipped, total: enrollments.length };
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export interface RecordPaymentInput {
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  paidAt?: Date;
  reference?: string | null;
  notes?: string | null;
  recordedByUserId: string;
}

/**
 * Record a payment and update the invoice balance.
 *
 * The invoice row is locked for the duration of the transaction, so two
 * simultaneous payments cannot both read the same balance and overwrite each
 * other. Overpayment is rejected rather than silently accepted.
 */
export async function recordPayment(input: RecordPaymentInput) {
  if (input.amount <= 0) {
    throw validationError('The payment amount must be greater than zero.');
  }

  const rules = await getFeeRules();

  return prisma.$transaction(async (tx) => {
    // Lock the invoice row to serialise concurrent payments against it.
    const locked = await tx.$queryRaw<
      { id: string; balance: string; status: string; studentId: string }[]
    >`
      SELECT id, balance::text AS balance, status::text AS status, "studentId"
      FROM "Invoice"
      WHERE id = ${input.invoiceId}
      FOR UPDATE
    `;

    if (locked.length === 0) throw notFound('Invoice not found.');

    const invoice = await tx.invoice.findUnique({
      where: { id: input.invoiceId },
      include: { items: true },
    });

    if (!invoice) throw notFound('Invoice not found.');

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw conflict('This invoice was cancelled and cannot receive payments.');
    }
    if (invoice.status === InvoiceStatus.REFUNDED) {
      throw conflict('This invoice was refunded and cannot receive further payments.');
    }

    const balance = toNumber(invoice.balance);
    const amount = round2(input.amount);

    if (amount > balance) {
      throw validationError(
        `The payment exceeds the outstanding balance of ${balance.toFixed(2)}.`,
        { balance },
      );
    }

    const receiptNo = await nextSequence(
      tx,
      rules.receiptPrefix,
      periodKey(input.paidAt ?? new Date()),
    );

    const payment = await tx.payment.create({
      data: {
        receiptNo,
        invoiceId: invoice.id,
        studentId: invoice.studentId,
        amount,
        method: input.method,
        status: PaymentStatus.CONFIRMED,
        paidAt: input.paidAt ?? new Date(),
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        recordedByUserId: input.recordedByUserId,
      },
    });

    const amountPaid = round2(toNumber(invoice.amountPaid) + amount);
    const newBalance = round2(toNumber(invoice.totalAmount) - amountPaid);

    const status: InvoiceStatus =
      newBalance <= 0.004
        ? InvoiceStatus.PAID
        : invoice.dueDate.getTime() < Date.now()
          ? InvoiceStatus.OVERDUE
          : InvoiceStatus.PARTIALLY_PAID;

    await tx.invoice.update({
      where: { id: invoice.id },
      data: { amountPaid, balance: Math.max(0, newBalance), status },
    });

    return { payment, invoice: { amountPaid, balance: Math.max(0, newBalance), status } };
  });
}

/** Reverse a confirmed payment, restoring the invoice balance. */
export async function reversePayment(options: {
  paymentId: string;
  reason: string;
  actorUserId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: options.paymentId },
      include: { invoice: true },
    });

    if (!payment) throw notFound('Payment not found.');
    if (payment.status !== PaymentStatus.CONFIRMED) {
      throw conflict('Only a confirmed payment can be reversed.');
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.REVERSED,
        reversedAt: new Date(),
        reversalReason: options.reason,
      },
    });

    const amount = toNumber(payment.amount);
    const amountPaid = round2(Math.max(0, toNumber(payment.invoice.amountPaid) - amount));
    const balance = round2(toNumber(payment.invoice.totalAmount) - amountPaid);

    const status: InvoiceStatus =
      amountPaid <= 0
        ? InvoiceStatus.ISSUED
        : balance <= 0.004
          ? InvoiceStatus.PAID
          : InvoiceStatus.PARTIALLY_PAID;

    await tx.invoice.update({
      where: { id: payment.invoiceId },
      data: { amountPaid, balance, status },
    });

    await tx.feeAdjustment.create({
      data: {
        invoiceId: payment.invoiceId,
        studentId: payment.studentId,
        type: AdjustmentType.CORRECTION,
        amount,
        reason: `Payment ${payment.receiptNo} reversed: ${options.reason}`,
        authorizedByUserId: options.actorUserId,
      },
    });

    return { amountPaid, balance, status };
  });
}

/** Apply an authorized discount or scholarship to an existing invoice. */
export async function applyAdjustment(options: {
  invoiceId: string;
  type: AdjustmentType;
  amount: number;
  reason: string;
  actorUserId: string;
}) {
  if (options.amount <= 0) {
    throw validationError('The adjustment amount must be greater than zero.');
  }

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: options.invoiceId },
      select: {
        id: true,
        studentId: true,
        subtotal: true,
        discountTotal: true,
        lateFeeTotal: true,
        amountPaid: true,
        totalAmount: true,
        status: true,
      },
    });

    if (!invoice) throw notFound('Invoice not found.');

    if (invoice.status === InvoiceStatus.CANCELLED || invoice.status === InvoiceStatus.REFUNDED) {
      throw conflict('Adjustments cannot be applied to a cancelled or refunded invoice.');
    }

    const isCharge = options.type === AdjustmentType.LATE_FEE;

    if (!isCharge && options.amount > toNumber(invoice.subtotal) - toNumber(invoice.discountTotal)) {
      throw validationError('The adjustment exceeds the remaining invoice subtotal.');
    }

    const discountTotal = isCharge
      ? toNumber(invoice.discountTotal)
      : round2(toNumber(invoice.discountTotal) + options.amount);
    // A discount does not touch late fees, and a late fee does not touch discounts.
    const lateFeeTotal = isCharge
      ? round2(toNumber(invoice.lateFeeTotal) + options.amount)
      : toNumber(invoice.lateFeeTotal);

    const totalAmount = round2(
      toNumber(invoice.subtotal) - discountTotal + lateFeeTotal,
    );

    const balance = round2(totalAmount - toNumber(invoice.amountPaid));

    if (balance < 0) {
      throw validationError(
        'This adjustment would make the balance negative. Reverse the payment first.',
      );
    }

    await tx.feeAdjustment.create({
      data: {
        invoiceId: invoice.id,
        studentId: invoice.studentId,
        type: options.type,
        amount: round2(options.amount),
        reason: options.reason,
        authorizedByUserId: options.actorUserId,
      },
    });

    const status: InvoiceStatus =
      balance <= 0.004
        ? InvoiceStatus.PAID
        : toNumber(invoice.amountPaid) > 0
          ? InvoiceStatus.PARTIALLY_PAID
          : InvoiceStatus.ISSUED;

    const updated = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        discountTotal,
        lateFeeTotal,
        totalAmount,
        balance,
        status,
      },
    });

    return updated;
  });
}

/** Cancel an unpaid invoice. An invoice with payments must be refunded instead. */
export async function cancelInvoice(options: {
  invoiceId: string;
  reason: string;
  actorUserId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: options.invoiceId },
      select: { id: true, amountPaid: true, status: true },
    });

    if (!invoice) throw notFound('Invoice not found.');

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw conflict('This invoice is already cancelled.');
    }

    if (toNumber(invoice.amountPaid) > 0) {
      throw conflict(
        'This invoice has payments recorded against it. Reverse the payments before cancelling.',
      );
    }

    return tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: InvoiceStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: options.reason,
        balance: 0,
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/** Mark invoices past their due date as overdue. Called by the scheduler. */
export async function refreshOverdueInvoices(): Promise<number> {
  const result = await prisma.invoice.updateMany({
    where: {
      dueDate: { lt: new Date() },
      balance: { gt: 0 },
      status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID] },
    },
    data: { status: InvoiceStatus.OVERDUE },
  });
  return result.count;
}

export async function collectionSummary(options: { from: Date; to: Date }) {
  const [payments, byMethod, byDay] = await Promise.all([
    prisma.payment.aggregate({
      where: {
        status: PaymentStatus.CONFIRMED,
        paidAt: { gte: options.from, lte: options.to },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.payment.groupBy({
      by: ['method'],
      where: {
        status: PaymentStatus.CONFIRMED,
        paidAt: { gte: options.from, lte: options.to },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.$queryRaw<{ day: Date; total: string }[]>`
      SELECT DATE_TRUNC('day', "paidAt") AS day, SUM(amount)::text AS total
      FROM "Payment"
      WHERE status = 'CONFIRMED' AND "paidAt" BETWEEN ${options.from} AND ${options.to}
      GROUP BY day
      ORDER BY day ASC
    `,
  ]);

  return {
    total: round2(toNumber(payments._sum.amount)),
    count: payments._count._all,
    byMethod: byMethod.map((row) => ({
      method: row.method,
      total: round2(toNumber(row._sum.amount)),
      count: row._count._all,
    })),
    daily: byDay.map((row) => ({
      date: row.day,
      total: round2(Number(row.total)),
    })),
  };
}

export async function outstandingSummary(options: { classSectionId?: string } = {}) {
  const where: Prisma.InvoiceWhereInput = {
    balance: { gt: 0 },
    status: { notIn: [InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED, InvoiceStatus.DRAFT] },
    ...(options.classSectionId ? { classSectionId: options.classSectionId } : {}),
  };

  const [aggregate, overdue, byClass] = await Promise.all([
    prisma.invoice.aggregate({ where, _sum: { balance: true, totalAmount: true }, _count: { _all: true } }),
    prisma.invoice.aggregate({
      where: { ...where, dueDate: { lt: new Date() } },
      _sum: { balance: true },
      _count: { _all: true },
    }),
    prisma.invoice.groupBy({
      by: ['classSectionId'],
      where,
      _sum: { balance: true },
      _count: { _all: true },
    }),
  ]);

  return {
    totalOutstanding: round2(toNumber(aggregate._sum.balance)),
    totalInvoiced: round2(toNumber(aggregate._sum.totalAmount)),
    invoiceCount: aggregate._count._all,
    overdueAmount: round2(toNumber(overdue._sum.balance)),
    overdueCount: overdue._count._all,
    byClass: byClass.map((row) => ({
      classSectionId: row.classSectionId,
      outstanding: round2(toNumber(row._sum.balance)),
      count: row._count._all,
    })),
  };
}

/**
 * Aging buckets for outstanding balances. Buckets are computed in SQL so the
 * figures stay correct for large invoice tables without loading every row.
 */
export async function agingReport(options: { classSectionId?: string } = {}) {
  const rows = await prisma.$queryRaw<
    { bucket: string; total: string; count: bigint }[]
  >`
    SELECT
      CASE
        WHEN "dueDate" >= CURRENT_DATE THEN 'current'
        WHEN "dueDate" >= CURRENT_DATE - INTERVAL '30 days' THEN '1-30'
        WHEN "dueDate" >= CURRENT_DATE - INTERVAL '60 days' THEN '31-60'
        WHEN "dueDate" >= CURRENT_DATE - INTERVAL '90 days' THEN '61-90'
        ELSE '90+'
      END AS bucket,
      SUM(balance)::text AS total,
      COUNT(*) AS count
    FROM "Invoice"
    WHERE balance > 0
      AND status NOT IN ('CANCELLED', 'REFUNDED', 'DRAFT')
      ${options.classSectionId ? prisma.$queryRaw`AND "classSectionId" = ${options.classSectionId}` : prisma.$queryRaw``}
    GROUP BY bucket
  `;

  const buckets: Record<string, { total: number; count: number }> = {
    current: { total: 0, count: 0 },
    '1-30': { total: 0, count: 0 },
    '31-60': { total: 0, count: 0 },
    '61-90': { total: 0, count: 0 },
    '90+': { total: 0, count: 0 },
  };

  for (const row of rows) {
    buckets[row.bucket] = {
      total: round2(Number(row.total)),
      count: Number(row.count),
    };
  }

  return buckets;
}

export interface StudentFeeSummary {
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  totalDiscount: number;
  overdueAmount: number;
  invoiceCount: number;
  openInvoiceCount: number;
}

export async function studentFeeSummary(studentId: string): Promise<StudentFeeSummary> {
  const invoices = await prisma.invoice.findMany({
    where: {
      studentId,
      status: { notIn: [InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED, InvoiceStatus.DRAFT] },
    },
    select: {
      totalAmount: true,
      amountPaid: true,
      balance: true,
      discountTotal: true,
      dueDate: true,
      status: true,
    },
  });

  const now = Date.now();
  let totalInvoiced = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;
  let totalDiscount = 0;
  let overdueAmount = 0;
  let openInvoiceCount = 0;

  for (const invoice of invoices) {
    totalInvoiced += toNumber(invoice.totalAmount);
    totalPaid += toNumber(invoice.amountPaid);
    totalOutstanding += toNumber(invoice.balance);
    totalDiscount += toNumber(invoice.discountTotal);

    if (toNumber(invoice.balance) > 0) {
      openInvoiceCount += 1;
      if (invoice.dueDate.getTime() < now) overdueAmount += toNumber(invoice.balance);
    }
  }

  return {
    totalInvoiced: round2(totalInvoiced),
    totalPaid: round2(totalPaid),
    totalOutstanding: round2(totalOutstanding),
    totalDiscount: round2(totalDiscount),
    overdueAmount: round2(overdueAmount),
    invoiceCount: invoices.length,
    openInvoiceCount,
  };
}

export const FEE_FREQUENCY_LABELS: Record<FeeFrequency, string> = {
  [FeeFrequency.ONE_TIME]: 'One time',
  [FeeFrequency.MONTHLY]: 'Monthly',
  [FeeFrequency.QUARTERLY]: 'Quarterly',
  [FeeFrequency.TERM]: 'Per term',
  [FeeFrequency.ANNUAL]: 'Annual',
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  [InvoiceStatus.DRAFT]: 'Draft',
  [InvoiceStatus.ISSUED]: 'Issued',
  [InvoiceStatus.PARTIALLY_PAID]: 'Partially paid',
  [InvoiceStatus.PAID]: 'Paid',
  [InvoiceStatus.OVERDUE]: 'Overdue',
  [InvoiceStatus.CANCELLED]: 'Cancelled',
  [InvoiceStatus.REFUNDED]: 'Refunded',
};

export const INVOICE_STATUS_TONES: Record<
  InvoiceStatus,
  'neutral' | 'info' | 'success' | 'warning' | 'danger'
> = {
  [InvoiceStatus.DRAFT]: 'neutral',
  [InvoiceStatus.ISSUED]: 'info',
  [InvoiceStatus.PARTIALLY_PAID]: 'warning',
  [InvoiceStatus.PAID]: 'success',
  [InvoiceStatus.OVERDUE]: 'danger',
  [InvoiceStatus.CANCELLED]: 'neutral',
  [InvoiceStatus.REFUNDED]: 'neutral',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: 'Cash',
  [PaymentMethod.BANK_TRANSFER]: 'Bank transfer',
  [PaymentMethod.CHEQUE]: 'Cheque',
  [PaymentMethod.CARD]: 'Card',
  [PaymentMethod.ONLINE_GATEWAY]: 'Online payment',
  [PaymentMethod.ADJUSTMENT]: 'Adjustment',
};
