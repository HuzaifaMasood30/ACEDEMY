import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { created, fail } from '@/lib/api';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';
import { logEvent } from '@/lib/audit';
import { enqueueNotification, dedupeKeys } from '@/server/notifications/queue';
import { getAcademyProfile } from '@/server/settings';

/**
 * Public admission application.
 *
 * Unauthenticated, so it is rate-limited per client, validated strictly, and
 * writes only the fields the form actually collects. No account is created
 * here — enrolment is an administrator action.
 */
const applicationSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.').max(60),
  lastName: z.string().trim().min(1, 'Last name is required.').max(60),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).default('MALE'),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date of birth as YYYY-MM-DD.'),
  guardianName: z.string().trim().min(2, 'Guardian name is required.').max(120),
  guardianRelation: z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER']).default('FATHER'),
  guardianPhone: z
    .string()
    .trim()
    .min(7, 'Enter a contact telephone number.')
    .max(30)
    .refine(
      (value) => value.replace(/\D/g, '').length >= 7,
      'Enter a valid telephone number including the country code.',
    ),
  guardianEmail: z
    .string()
    .trim()
    .max(160)
    .refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Enter a valid email address.')
    .optional()
    .default(''),
  phone: z.string().trim().max(30).optional().default(''),
  email: z
    .string()
    .trim()
    .max(160)
    .refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Enter a valid email address.')
    .optional()
    .default(''),
  address: z.string().trim().max(400).optional().default(''),
  previousSchool: z.string().trim().max(160).optional().default(''),
  previousGrade: z.string().trim().max(60).optional().default(''),
  courseCode: z.string().trim().max(40).optional().default(''),
  requestedClass: z.string().trim().max(120).optional().default(''),
  message: z.string().trim().max(2000).optional().default(''),
  trialClassRequested: z.boolean().default(false),
  consentToContact: z
    .boolean()
    .refine((value) => value === true, 'Please confirm we may contact you.'),
});

/** `APP-2026-00042` — sequence is per year so numbers stay short and readable. */
async function nextApplicationNumber(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const key = `sequence:application-${year}`;

  return prisma.$transaction(async (tx) => {
    const counter = await tx.setting.upsert({
      where: { key },
      create: { key, value: { last: 0 }, category: 'sequence' },
      update: {},
    });

    const current = counter.value as { last?: number };
    const next = (current.last ?? 0) + 1;

    await tx.setting.update({ where: { key }, data: { value: { last: next } } });

    return `APP-${year}-${String(next).padStart(5, '0')}`;
  });
}

export async function POST(request: Request) {
  try {
    const limit = await checkRateLimit(
      `admission:${clientIp(request)}`,
      5,
      60 * 60,
    );

    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: {
            code: 'RATE_LIMITED',
            message:
              'Too many applications have been submitted from this connection. Please try again later or contact the academy office.',
          },
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(
              Math.max(1, Math.ceil((limit.resetAt.getTime() - Date.now()) / 1000)),
            ),
          },
        },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'The request body must be valid JSON.' } },
        { status: 422 },
      );
    }

    const parsed = applicationSchema.parse(body);

    const dateOfBirth = new Date(`${parsed.dateOfBirth}T00:00:00.000Z`);
    if (Number.isNaN(dateOfBirth.getTime())) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'The date of birth is not a valid date.' } },
        { status: 422 },
      );
    }

    // A date of birth in the future, or implying an implausible age, is a typo.
    const ageYears = (Date.now() - dateOfBirth.getTime()) / (365.25 * 86_400_000);
    if (ageYears < 2 || ageYears > 80) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message: 'The date of birth does not look correct. Please check it.',
          },
        },
        { status: 422 },
      );
    }

    const course = parsed.courseCode
      ? await prisma.course.findFirst({
          where: { code: parsed.courseCode, isActive: true },
          select: { id: true, name: true },
        })
      : null;

    const applicationNo = await nextApplicationNumber();

    const application = await prisma.admissionApplication.create({
      data: {
        applicationNo,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        gender: parsed.gender,
        dateOfBirth,
        email: parsed.email || null,
        phone: parsed.phone || null,
        address: parsed.address || null,
        guardianName: parsed.guardianName,
        guardianPhone: parsed.guardianPhone,
        guardianEmail: parsed.guardianEmail || null,
        guardianRelation: parsed.guardianRelation,
        previousSchool: parsed.previousSchool || null,
        previousGrade: parsed.previousGrade || null,
        courseId: course?.id ?? null,
        requestedClass: parsed.requestedClass || null,
        message: parsed.message || null,
        trialClassRequested: parsed.trialClassRequested,
        consentToContact: parsed.consentToContact,
        status: 'APPLICANT',
        source: 'ONLINE',
      },
      select: { id: true, applicationNo: true },
    });

    await logEvent('admission', 'Online application submitted', {
      detail: {
        entity: 'AdmissionApplication',
        entityId: application.id,
        applicationNo: application.applicationNo,
        course: course?.name ?? null,
        trialClassRequested: parsed.trialClassRequested,
      },
    });

    // Acknowledge the applicant on the number they supplied. Failure to queue
    // must not fail the submission, so this is best-effort.
    try {
      const profile = await getAcademyProfile();

      await enqueueNotification({
        category: 'ADMISSION_UPDATE',
        dedupeKey: dedupeKeys.admissionUpdate(application.id, 'received'),
        recipientPhone: parsed.guardianPhone,
        templateKey: 'admission_received',
        context: {
          guardianName: parsed.guardianName,
          studentName: `${parsed.firstName} ${parsed.lastName}`.trim(),
          invoiceNo: application.applicationNo,
          academyName: profile.name,
        },
        payload: { applicationId: application.id, kind: 'received' },
      });
    } catch (notificationError) {
      console.error('[admissions] acknowledgement could not be queued:', notificationError);
    }

    return created({
      applicationNo: application.applicationNo,
      submittedAt: new Date().toISOString(),
    });
  } catch (error) {
    return fail(error, 'public admission application');
  }
}

/** Track an application by reference number and date of birth. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const reference = url.searchParams.get('reference')?.trim() ?? '';
    const dateOfBirth = url.searchParams.get('dateOfBirth')?.trim() ?? '';

    if (!reference || !dateOfBirth) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message: 'Provide both the application reference and the date of birth.',
          },
        },
        { status: 422 },
      );
    }

    const limit = await checkRateLimit(`admission-track:${clientIp(request)}`, 20, 15 * 60);

    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many lookups. Please try again shortly.',
          },
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(
              Math.max(1, Math.ceil((limit.resetAt.getTime() - Date.now()) / 1000)),
            ),
          },
        },
      );
    }

    // Requiring the date of birth stops a reference number alone from exposing
    // an applicant's record to anyone who guesses one.
    const application = await prisma.admissionApplication.findFirst({
      where: {
        applicationNo: reference,
        dateOfBirth: new Date(`${dateOfBirth}T00:00:00.000Z`),
      },
      select: {
        applicationNo: true,
        firstName: true,
        status: true,
        requestedClass: true,
        reviewNotes: true,
        createdAt: true,
        reviewedAt: true,
      },
    });

    if (!application) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message:
              'No application matches that reference and date of birth. Please check both values.',
          },
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      data: {
        applicationNo: application.applicationNo,
        studentName: application.firstName,
        status: application.status,
        requestedClass: application.requestedClass,
        submittedAt: application.createdAt,
        reviewedAt: application.reviewedAt,
        reviewNotes: application.reviewNotes,
      },
    });
  } catch (error) {
    return fail(error, 'public admission tracking');
  }
}
