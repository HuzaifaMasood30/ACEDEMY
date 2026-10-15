import { NextResponse } from 'next/server';
import { fail, guard, parseListQuery } from '@/server/api-helpers';
import { PERMISSIONS, hasPermission } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { studentScopeFilter } from '@/server/auth-guard';
import { writeAudit } from '@/lib/audit';
import { EnrollmentStatus, InvoiceStatus, PaymentStatus, Prisma } from '@prisma/client';
import { getAttendanceRules } from '@/server/settings';

/**
 * Academy reports.
 *
 * Every report is generated from live data at request time, so a downloaded
 * figure always matches what the screens show. Money is summed in the database
 * rather than in JavaScript, which avoids float drift on large ledgers.
 */

function toCsv(rows: Array<Record<string, unknown>>, headers: string[]): string {
  const escape = (value: unknown) => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
  ].join('\n');
}

const REPORTS = ['enrollment', 'attendance', 'fees', 'collections', 'dues', 'exams'] as const;

/** Reports that expose money. Only roles holding this permission may run them. */
const FINANCE_REPORTS = ['fees', 'collections', 'dues'] as const;

export async function GET(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.REPORT_VIEW);
    const query = parseListQuery(request);
    const report = query.params.get('report') ?? 'enrollment';
    const format = query.params.get('format') ?? 'json';
    const from = query.params.get('from');
    const to = query.params.get('to');
    const academicSessionId = query.params.get('academicSessionId');
    const classSectionId = query.params.get('classSectionId');

    if (!REPORTS.includes(report as (typeof REPORTS)[number])) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message: `Unknown report "${report}". Choose one of: ${REPORTS.join(', ')}.`,
          },
        },
        { status: 422 },
      );
    }

    // Financial reports are administrator/staff-only. A student or guardian
    // holds REPORT_VIEW for their own progress report, which must never grant
    // sight of academy-wide fee data.
    if (
      (FINANCE_REPORTS as readonly string[]).includes(report) &&
      !hasPermission(actor.permissions, PERMISSIONS.FINANCE_REPORTS)
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Your role does not include access to financial reports.',
          },
        },
        { status: 403 },
      );
    }

    // Every non-financial report is filtered to the students the actor may see.
    // Administrators get an empty filter; students get only themselves; parents
    // get their linked children; teachers get their assigned classes.
    const studentWhere = await studentScopeFilter(actor);
    const scopedStudentIds = 'id' in studentWhere ? studentWhere : null;

    let data: Array<Record<string, unknown>> = [];
    let headers: string[] = [];

    if (report === 'enrollment') {
      // Capacity and utilisation describe the whole academy, so this report is
      // only meaningful for staff. A scoped actor receives their own classes.
      const classes = await prisma.classSection.findMany({
        where: {
          isActive: true,
          ...(scopedStudentIds
            ? {
                enrollments: {
                  some: { studentId: scopedStudentIds.id, status: EnrollmentStatus.ACTIVE },
                },
              }
            : {}),
        },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          capacity: true,
          course: { select: { name: true } },
          _count: { select: { enrollments: { where: { status: EnrollmentStatus.ACTIVE } } } },
        },
      });

      headers = ['Class', 'Course', 'Enrolled', 'Capacity', 'Utilisation %'];
      data = classes.map((c) => {
        const enrolled = c._count.enrollments;
        return {
          Class: c.name,
          Course: c.course.name,
          Enrolled: enrolled,
          Capacity: c.capacity ?? 'Unlimited',
          'Utilisation %': c.capacity ? ((enrolled / c.capacity) * 100).toFixed(1) : 'n/a',
        };
      });
    }

    if (report === 'attendance') {
      const dateFilter =
        from || to
          ? {
              date: {
                ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
                ...(to ? { lte: new Date(`${to}T00:00:00.000Z`) } : {}),
              },
            }
          : {};

      const where: Prisma.AttendanceRecordWhereInput = {
        ...(scopedStudentIds ? { studentId: scopedStudentIds.id } : {}),
        attendanceSession: {
          ...dateFilter,
          ...(classSectionId ? { classSectionId } : {}),
        },
      };

      const grouped = await prisma.attendanceRecord.groupBy({
        by: ['studentId', 'status'],
        where,
        _count: { _all: true },
      });

      const studentIds = Array.from(new Set(grouped.map((g) => g.studentId)));
      const students = await prisma.student.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, admissionNo: true, firstName: true, lastName: true },
      });
      const byId = new Map(students.map((s) => [s.id, s]));

      const rules = await getAttendanceRules();

      const buckets = new Map<
        string,
        { present: number; absent: number; late: number; excused: number; leave: number; total: number }
      >();

      for (const row of grouped) {
        const bucket =
          buckets.get(row.studentId) ??
          { present: 0, absent: 0, late: 0, excused: 0, leave: 0, total: 0 };
        const count = row._count._all;
        bucket.total += count;

        if (row.status === 'PRESENT') bucket.present += count;
        if (row.status === 'ABSENT') bucket.absent += count;
        if (row.status === 'LATE') bucket.late += count;
        if (row.status === 'EXCUSED') bucket.excused += count;
        if (row.status === 'LEAVE_APPROVED') bucket.leave += count;

        buckets.set(row.studentId, bucket);
      }

      headers = [
        'Admission No',
        'Student',
        'Total',
        'Present',
        'Absent',
        'Late',
        'Excused',
        'Leave approved',
        'Attendance %',
        'Below threshold',
      ];

      data = Array.from(buckets.entries()).map(([studentId, bucket]) => {
        const student = byId.get(studentId);
        const percentage =
          bucket.total > 0 ? ((bucket.total - bucket.absent) / bucket.total) * 100 : 0;

        return {
          'Admission No': student?.admissionNo ?? '',
          Student: `${student?.firstName ?? ''} ${student?.lastName ?? ''}`.trim(),
          Total: bucket.total,
          Present: bucket.present,
          Absent: bucket.absent,
          Late: bucket.late,
          Excused: bucket.excused,
          'Leave approved': bucket.leave,
          'Attendance %': percentage.toFixed(1),
          'Below threshold': percentage < rules.minimumPercentage ? 'Yes' : 'No',
        };
      });
    }

    if (report === 'fees') {
      const invoices = await prisma.invoice.findMany({
        where: {
          status: { notIn: [InvoiceStatus.CANCELLED, InvoiceStatus.DRAFT] },
          ...(from || to
            ? {
                issueDate: {
                  ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
                  ...(to ? { lte: new Date(`${to}T00:00:00.000Z`) } : {}),
                },
              }
            : {}),
          ...(academicSessionId ? { academicSessionId } : {}),
        },
        select: {
          invoiceNo: true,
          issueDate: true,
          dueDate: true,
          subtotal: true,
          discountTotal: true,
          lateFeeTotal: true,
          totalAmount: true,
          amountPaid: true,
          balance: true,
          status: true,
          student: { select: { admissionNo: true, firstName: true, lastName: true } },
        },
      });

      headers = [
        'Invoice',
        'Issued',
        'Due',
        'Student',
        'Admission No',
        'Subtotal',
        'Discount',
        'Late fee',
        'Total',
        'Paid',
        'Balance',
        'Status',
      ];

      data = invoices.map((invoice) => ({
        Invoice: invoice.invoiceNo,
        Issued: invoice.issueDate.toISOString().slice(0, 10),
        Due: invoice.dueDate.toISOString().slice(0, 10),
        Student: `${invoice.student.firstName} ${invoice.student.lastName}`.trim(),
        'Admission No': invoice.student.admissionNo,
        Subtotal: invoice.subtotal.toString(),
        Discount: invoice.discountTotal.toString(),
        'Late fee': invoice.lateFeeTotal.toString(),
        Total: invoice.totalAmount.toString(),
        Paid: invoice.amountPaid.toString(),
        Balance: invoice.balance.toString(),
        Status: invoice.status,
      }));
    }

    if (report === 'collections') {
      const payments = await prisma.payment.findMany({
        where: {
          status: PaymentStatus.CONFIRMED,
          ...(from || to
            ? {
                paidAt: {
                  ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
                  ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
                },
              }
            : {}),
        },
        orderBy: { paidAt: 'desc' },
        select: {
          receiptNo: true,
          paidAt: true,
          amount: true,
          method: true,
          reference: true,
          student: { select: { admissionNo: true, firstName: true, lastName: true } },
          invoice: { select: { invoiceNo: true } },
        },
      });

      headers = [
        'Receipt',
        'Date',
        'Student',
        'Admission No',
        'Invoice',
        'Method',
        'Reference',
        'Amount',
      ];

      data = payments.map((payment) => ({
        Receipt: payment.receiptNo,
        Date: payment.paidAt.toISOString().slice(0, 10),
        Student: `${payment.student.firstName} ${payment.student.lastName}`.trim(),
        'Admission No': payment.student.admissionNo,
        Invoice: payment.invoice.invoiceNo,
        Method: payment.method,
        Reference: payment.reference ?? '',
        Amount: payment.amount.toString(),
      }));
    }

    if (report === 'dues') {
      const invoices = await prisma.invoice.findMany({
        where: {
          balance: { gt: 0 },
          status: {
            in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE],
          },
        },
        orderBy: { dueDate: 'asc' },
        select: {
          invoiceNo: true,
          dueDate: true,
          totalAmount: true,
          amountPaid: true,
          balance: true,
          student: {
            select: {
              admissionNo: true,
              firstName: true,
              lastName: true,
              guardians: {
                where: { isPrimary: true },
                select: { contactPhone: true, guardianUser: { select: { phone: true } } },
                take: 1,
              },
            },
          },
        },
      });

      const now = Date.now();

      headers = [
        'Invoice',
        'Due',
        'Student',
        'Admission No',
        'Guardian phone',
        'Total',
        'Paid',
        'Balance',
        'Days overdue',
        'Aging bucket',
      ];

      data = invoices.map((invoice) => {
        const overdueDays = Math.max(
          0,
          Math.floor((now - invoice.dueDate.getTime()) / 86_400_000),
        );

        const bucket =
          overdueDays === 0
            ? 'Not due'
            : overdueDays <= 30
              ? '1-30'
              : overdueDays <= 60
                ? '31-60'
                : '60+';

        const guardian = invoice.student.guardians[0];

        return {
          Invoice: invoice.invoiceNo,
          Due: invoice.dueDate.toISOString().slice(0, 10),
          Student: `${invoice.student.firstName} ${invoice.student.lastName}`.trim(),
          'Admission No': invoice.student.admissionNo,
          'Guardian phone': guardian?.contactPhone ?? guardian?.guardianUser.phone ?? '',
          Total: invoice.totalAmount.toString(),
          Paid: invoice.amountPaid.toString(),
          Balance: invoice.balance.toString(),
          'Days overdue': overdueDays,
          'Aging bucket': bucket,
        };
      });
    }

    if (report === 'exams') {
      const results = await prisma.examResult.findMany({
        where: {
          ...(scopedStudentIds ? { studentId: scopedStudentIds.id } : {}),
          examSubject: {
            exam: {
              resultStatus: 'PUBLISHED',
              ...(academicSessionId ? { academicSessionId } : {}),
            },
          },
        },
        select: {
          marksObtained: true,
          percentage: true,
          grade: true,
          status: true,
          student: { select: { admissionNo: true, firstName: true, lastName: true } },
          examSubject: {
            select: {
              maxMarks: true,
              passMarks: true,
              subject: { select: { name: true } },
              exam: { select: { name: true } },
            },
          },
        },
        take: 5000,
      });

      headers = [
        'Exam',
        'Subject',
        'Student',
        'Admission No',
        'Marks',
        'Max',
        'Percentage',
        'Grade',
        'Status',
      ];

      data = results.map((result) => ({
        Exam: result.examSubject.exam.name,
        Subject: result.examSubject.subject.name,
        Student: `${result.student.firstName} ${result.student.lastName}`.trim(),
        'Admission No': result.student.admissionNo,
        Marks: result.marksObtained?.toString() ?? '',
        Max: result.examSubject.maxMarks.toString(),
        Percentage: result.percentage?.toString() ?? '',
        Grade: result.grade ?? '',
        Status: result.status,
      }));
    }

    if (format === 'csv') {
      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'report.export',
        entity: 'Report',
        after: { report, format, rows: data.length, from: from ?? null, to: to ?? null },
      });

      return new NextResponse(toCsv(data, headers), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${report}-report.csv"`,
        },
      });
    }

    return NextResponse.json({ data, meta: { report, rows: data.length, headers } });
  } catch (error) {
    return fail(error, 'reports GET');
  }
}
