import { z } from 'zod';
import { NextResponse } from 'next/server';
import { fail, guard, limit, body, parseListQuery, listResponse } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { notFound } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import {
  createInvoice,
  generateClassInvoices,
  recordPayment,
  reversePayment,
  applyAdjustment,
  cancelInvoice,
  studentFeeSummary,
} from '@/server/services/fees';
import {
  assertStudentAccess,
  getTeacherScope,
  studentScopeFilter,
} from '@/server/auth-guard';
import { money, dateOnly } from '@/lib/validation';
import { EnrollmentStatus, InvoiceStatus, Prisma, Role } from '@prisma/client';

const invoiceSchema = z.object({
  studentId: z.string().min(1),
  academicSessionId: z.string().min(1).optional().nullable(),
  termId: z.string().min(1).optional().nullable(),
  classSectionId: z.string().min(1).optional().nullable(),
  issueDate: dateOnly,
  dueDate: dateOnly,
  items: z
    .array(
      z.object({
        head: z.string().trim().min(1, 'Each charge needs a head.').max(80),
        description: z.string().trim().max(300).optional().nullable(),
        quantity: z.coerce.number().positive().max(1000).default(1),
        unitAmount: money,
      }),
    )
    .min(1, 'An invoice needs at least one charge.'),
  discount: z
    .object({
      type: z.enum(['DISCOUNT', 'SCHOLARSHIP', 'CONCESSION', 'WAIVER', 'CORRECTION']),
      amount: money,
      reason: z.string().trim().max(300).optional(),
    })
    .optional()
    .nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const paymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: money.refine((v) => v > 0, 'The payment must be greater than zero.'),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'CARD', 'ONLINE_GATEWAY', 'CHEQUE', 'ADJUSTMENT']),
  paidAt: z.coerce.date().optional(),
  reference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('reversePayment'),
    paymentId: z.string().min(1),
    reason: z.string().trim().min(3).max(300),
  }),
  z.object({
    action: z.literal('adjust'),
    invoiceId: z.string().min(1),
    type: z.enum([
      'DISCOUNT',
      'SCHOLARSHIP',
      'CONCESSION',
      'WAIVER',
      'LATE_FEE',
      'REFUND',
      'CORRECTION',
    ]),
    amount: money.refine((v) => v > 0, 'The adjustment must be greater than zero.'),
    reason: z.string().trim().min(3).max(300),
  }),
  z.object({
    action: z.literal('cancel'),
    invoiceId: z.string().min(1),
    reason: z.string().trim().min(3).max(300),
  }),
  z.object({
    action: z.literal('generateClass'),
    classSectionId: z.string().min(1),
    feeStructureId: z.string().min(1),
    academicSessionId: z.string().min(1),
    termId: z.string().min(1).optional().nullable(),
    issueDate: dateOnly,
    dueDate: dateOnly,
  }),
]);

/**
 * Fee reads.
 *
 * `scope=summary` returns the academy-wide position; `scope=student` returns a
 * single student's ledger and requires access to that student.
 */
export async function GET(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.INVOICE_VIEW);
    const query = parseListQuery(request);
    const scope = query.params.get('scope') ?? 'invoices';

    if (scope === 'invoice') {
      const invoiceId = query.params.get('invoiceId');
      if (!invoiceId) {
        return NextResponse.json(
          { error: { code: 'VALIDATION', message: 'An invoice is required.' } },
          { status: 422 },
        );
      }

      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: {
          id: true,
          invoiceNo: true,
          issueDate: true,
          dueDate: true,
          totalAmount: true,
          amountPaid: true,
          balance: true,
          subtotal: true,
          discountTotal: true,
          lateFeeTotal: true,
          status: true,
          notes: true,
          student: {
            select: { id: true, firstName: true, lastName: true, admissionNo: true },
          },
          classSection: { select: { id: true, name: true } },
          academicSession: { select: { id: true, name: true } },
          items: {
            select: {
              id: true,
              head: true,
              description: true,
              amount: true,
              quantity: true,
            },
          },
          payments: {
            orderBy: { paidAt: 'desc' },
            select: {
              id: true,
              receiptNo: true,
              amount: true,
              method: true,
              status: true,
              paidAt: true,
              reference: true,
            },
          },
          adjustments: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              type: true,
              amount: true,
              reason: true,
              createdAt: true,
            },
          },
        },
      });

      if (!invoice) throw notFound('Invoice not found.');
      await assertStudentAccess(actor, invoice.student.id, { forFee: true });

      return NextResponse.json({ data: invoice });
    }

    if (scope === 'student') {
      const studentId = query.params.get('studentId');
      if (!studentId) {
        return NextResponse.json(
          { error: { code: 'VALIDATION', message: 'A student is required.' } },
          { status: 422 },
        );
      }

      await assertStudentAccess(actor, studentId, { forFee: true });

      return NextResponse.json({ data: await studentFeeSummary(studentId) });
    }

    if (scope === 'payments') {
      const method = query.params.get('method');
      const from = query.params.get('from');
      const to = query.params.get('to');

      const where: Prisma.PaymentWhereInput = {
        ...(method ? { method: method as Prisma.EnumPaymentMethodFilter } : {}),
        ...(from || to
          ? {
              paidAt: {
                ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
                ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
              },
            }
          : {}),
        ...(query.search
          ? {
              OR: [
                { receiptNo: { contains: query.search, mode: 'insensitive' } },
                { reference: { contains: query.search, mode: 'insensitive' } },
                {
                  student: {
                    OR: [
                      { firstName: { contains: query.search, mode: 'insensitive' } },
                      { lastName: { contains: query.search, mode: 'insensitive' } },
                      { admissionNo: { contains: query.search, mode: 'insensitive' } },
                    ],
                  },
                },
              ],
            }
          : {}),
      };

      const [rows, total] = await Promise.all([
        prisma.payment.findMany({
          where,
          orderBy: { paidAt: 'desc' },
          skip: query.skip,
          take: query.take,
          select: {
            id: true,
            receiptNo: true,
            amount: true,
            method: true,
            status: true,
            paidAt: true,
            reference: true,
            student: {
              select: { id: true, firstName: true, lastName: true, admissionNo: true },
            },
            invoice: { select: { id: true, invoiceNo: true } },
          },
        }),
        prisma.payment.count({ where }),
      ]);

      return listResponse(rows, total, query);
    }

    const status = query.params.get('status');
    const overdueOnly = query.params.get('overdue') === 'true';
    const classSectionId = query.params.get('classSectionId');
    const academicSessionId = query.params.get('academicSessionId');
    const from = query.params.get('from');
    const to = query.params.get('to');

    const scopeFilter = await studentScopeFilter(actor);
    const hasStudentScope = 'id' in scopeFilter;

    // A teacher may only reach fee data for classes they are assigned to.
    const teacherScope =
      actor.role === Role.TEACHER ? await getTeacherScope(actor) : null;

    const where: Prisma.InvoiceWhereInput = {
      ...(hasStudentScope ? { studentId: scopeFilter.id } : {}),
      ...(teacherScope
        ? {
            student: {
              enrollments: {
                some: {
                  status: EnrollmentStatus.ACTIVE,
                  classSectionId: { in: teacherScope.classSectionIds },
                },
              },
            },
          }
        : {}),
      ...(status ? { status: status as InvoiceStatus } : {}),
      ...(overdueOnly ? { status: InvoiceStatus.OVERDUE, balance: { gt: 0 } } : {}),
      ...(classSectionId ? { classSectionId } : {}),
      ...(academicSessionId ? { academicSessionId } : {}),
      ...(from || to
        ? {
            issueDate: {
              ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
              ...(to ? { lte: new Date(`${to}T00:00:00.000Z`) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { invoiceNo: { contains: query.search, mode: 'insensitive' } },
              {
                student: {
                  OR: [
                    { firstName: { contains: query.search, mode: 'insensitive' } },
                    { lastName: { contains: query.search, mode: 'insensitive' } },
                    { admissionNo: { contains: query.search, mode: 'insensitive' } },
                  ],
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
        skip: query.skip,
        take: query.take,
        select: {
          id: true,
          invoiceNo: true,
          issueDate: true,
          dueDate: true,
          totalAmount: true,
          amountPaid: true,
          balance: true,
          status: true,
          student: {
            select: { id: true, firstName: true, lastName: true, admissionNo: true },
          },
          classSection: { select: { id: true, name: true } },
          _count: { select: { items: true, payments: true } },
        },
      }),
      prisma.invoice.count({ where }),
    ]);

    return listResponse(rows, total, query);
  } catch (error) {
    return fail(error, 'fees GET');
  }
}

/** Create an invoice. */
export async function POST(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.INVOICE_CREATE);
    await limit(request, 'fees:write', 90, 60);

    const payload = await body(request, invoiceSchema);

    const invoice = await createInvoice({
      studentId: payload.studentId,
      academicSessionId: payload.academicSessionId ?? null,
      termId: payload.termId ?? null,
      classSectionId: payload.classSectionId ?? null,
      issueDate: payload.issueDate,
      dueDate: payload.dueDate,
      items: payload.items,
      discount: payload.discount
        ? {
            type: payload.discount.type,
            amount: payload.discount.amount,
            reason: payload.discount.reason,
          }
        : null,
      notes: payload.notes ?? null,
      createdByUserId: actor.id,
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'invoice.create',
      entity: 'Invoice',
      entityId: invoice.id,
      after: {
        invoiceNo: invoice.invoiceNo,
        studentId: payload.studentId,
        totalAmount: invoice.totalAmount.toString(),
      },
    });

    return NextResponse.json({ data: invoice }, { status: 201 });
  } catch (error) {
    return fail(error, 'fees POST');
  }
}

/** Record a payment. */
export async function PATCH(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.PAYMENT_RECORD);
    await limit(request, 'fees:payment', 120, 60);

    const payload = await body(request, paymentSchema);

    const result = await recordPayment({
      invoiceId: payload.invoiceId,
      amount: payload.amount,
      method: payload.method,
      paidAt: payload.paidAt,
      reference: payload.reference ?? null,
      notes: payload.notes ?? null,
      recordedByUserId: actor.id,
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'payment.record',
      entity: 'Payment',
      entityId: result.payment.id,
      after: {
        receiptNo: result.payment.receiptNo,
        invoiceId: payload.invoiceId,
        amount: result.payment.amount.toString(),
        method: payload.method,
      },
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return fail(error, 'payment POST');
  }
}

/** Reversals, adjustments, cancellations and batch generation. */
export async function PUT(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.PAYMENT_RECORD);
    await limit(request, 'fees:action', 40, 60);

    const payload = await body(request, actionSchema);

    if (payload.action === 'reversePayment') {
      const result = await reversePayment({
        paymentId: payload.paymentId,
        reason: payload.reason,
        actorUserId: actor.id,
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'payment.reverse',
        entity: 'Payment',
        entityId: payload.paymentId,
        after: { reason: payload.reason },
      });

      return NextResponse.json({ data: result });
    }

    if (payload.action === 'adjust') {
      const result = await applyAdjustment({
        invoiceId: payload.invoiceId,
        type: payload.type,
        amount: payload.amount,
        reason: payload.reason,
        actorUserId: actor.id,
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'invoice.adjust',
        entity: 'Invoice',
        entityId: payload.invoiceId,
        after: {
          type: payload.type,
          amount: payload.amount,
          reason: payload.reason,
          balance: result.balance.toString(),
        },
      });

      return NextResponse.json({ data: result });
    }

    if (payload.action === 'cancel') {
      const result = await cancelInvoice({
        invoiceId: payload.invoiceId,
        reason: payload.reason,
        actorUserId: actor.id,
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'invoice.cancel',
        entity: 'Invoice',
        entityId: payload.invoiceId,
        after: { reason: payload.reason },
      });

      return NextResponse.json({ data: result });
    }

    const result = await generateClassInvoices({
      classSectionId: payload.classSectionId,
      feeStructureId: payload.feeStructureId,
      academicSessionId: payload.academicSessionId,
      termId: payload.termId ?? null,
      issueDate: payload.issueDate,
      dueDate: payload.dueDate,
      createdByUserId: actor.id,
      skipExisting: true,
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'invoice.generate_class',
      entity: 'ClassSection',
      entityId: payload.classSectionId,
      after: {
        created: result.created.length,
        skipped: result.skipped.length,
        total: result.total,
        feeStructureId: payload.feeStructureId,
      },
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return fail(error, 'fees action');
  }
}
