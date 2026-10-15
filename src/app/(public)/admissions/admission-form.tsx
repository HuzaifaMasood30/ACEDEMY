'use client';

import * as React from 'react';
import { AlertCircle, CheckCircle2, Send } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Field,
  Input,
  Select,
  Textarea,
} from '@/components/ui/primitives';
import { Card } from '@/components/ui/structure';

interface CourseOption {
  code: string;
  name: string;
  classes: string[];
}

interface FieldErrors {
  [key: string]: string;
}

export function AdmissionForm({ courses }: { courses: CourseOption[] }) {
  const [submitting, setSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [reference, setReference] = React.useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = React.useState(courses[0]?.code ?? '');

  const classOptions =
    courses.find((course) => course.code === selectedCourse)?.classes ?? [];

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setErrors({});

    const form = new FormData(event.currentTarget);
    const payload = {
      firstName: String(form.get('firstName') ?? '').trim(),
      lastName: String(form.get('lastName') ?? '').trim(),
      gender: String(form.get('gender') ?? ''),
      dateOfBirth: String(form.get('dateOfBirth') ?? ''),
      guardianName: String(form.get('guardianName') ?? '').trim(),
      guardianRelation: String(form.get('guardianRelation') ?? ''),
      guardianPhone: String(form.get('guardianPhone') ?? '').trim(),
      guardianEmail: String(form.get('guardianEmail') ?? '').trim(),
      phone: String(form.get('phone') ?? '').trim(),
      email: String(form.get('email') ?? '').trim(),
      address: String(form.get('address') ?? '').trim(),
      previousSchool: String(form.get('previousSchool') ?? '').trim(),
      previousGrade: String(form.get('previousGrade') ?? '').trim(),
      courseCode: String(form.get('courseCode') ?? ''),
      requestedClass: String(form.get('requestedClass') ?? '').trim(),
      message: String(form.get('message') ?? '').trim(),
      trialClassRequested: form.get('trialClassRequested') === 'on',
      consentToContact: form.get('consentToContact') === 'on',
    };

    const nextErrors: FieldErrors = {};
    if (!payload.firstName) nextErrors.firstName = 'Enter the student\u2019s first name.';
    if (!payload.lastName) nextErrors.lastName = 'Enter the student\u2019s last name.';
    if (!payload.dateOfBirth) nextErrors.dateOfBirth = 'Enter the date of birth.';
    if (!payload.guardianName) nextErrors.guardianName = 'Enter the parent or guardian name.';
    if (!payload.guardianPhone) {
      nextErrors.guardianPhone = 'Enter a contact telephone number.';
    } else if (payload.guardianPhone.replace(/\D/g, '').length < 7) {
      nextErrors.guardianPhone = 'Enter a valid telephone number, including the country code.';
    }
    if (payload.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.email)) {
      nextErrors.email = 'Enter a valid email address.';
    }
    if (!payload.consentToContact) {
      nextErrors.consentToContact = 'Please confirm we may contact you about this application.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setFormError('Please correct the highlighted fields and submit again.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/public/admissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const details = body?.error?.details;
        if (Array.isArray(details)) {
          const mapped: FieldErrors = {};
          for (const item of details) {
            if (item?.path) mapped[String(item.path)] = String(item.message ?? '');
          }
          setErrors(mapped);
        }
        setFormError(
          body?.error?.message ??
            'We could not submit your application. Please try again or contact the office.',
        );
        setSubmitting(false);
        return;
      }

      setReference(body.data.applicationNo);
      setSubmitting(false);
    } catch {
      setFormError(
        'We could not reach the academy server. Check your connection and try again.',
      );
      setSubmitting(false);
    }
  }

  if (reference) {
    return (
      <Card className="border-[var(--ok)]/30 bg-[var(--ok-soft)] p-6">
        <div className="flex items-start gap-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--ok)] text-white">
            <CheckCircle2 className="size-5.5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[var(--ok-soft-ink)]">
              Application received
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--ok-soft-ink)] opacity-90">
              Thank you. Your application has been recorded and the academy office will
              contact you within two working days to arrange an assessment.
            </p>

            <div className="mt-4 rounded-lg border border-[var(--ok)]/25 bg-[var(--surface)] p-4">
              <p className="text-xs font-medium tracking-wide text-[var(--ink-subtle)] uppercase">
                Your application reference
              </p>
              <p className="tabular mt-1 font-mono text-xl font-semibold tracking-tight text-[var(--ink)]">
                {reference}
              </p>
              <p className="mt-2 text-xs text-[var(--ink-muted)]">
                Please keep this number. Quote it in any correspondence with the academy.
              </p>
            </div>

            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setReference(null);
                setErrors({});
              }}
            >
              Submit another application
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-7">
      {formError && (
        <Alert tone="danger" icon={<AlertCircle className="size-4" />}>
          {formError}
        </Alert>
      )}

      {/* Student details */}
      <fieldset className="space-y-4">
        <legend className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
          <span className="flex size-5 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[0.625rem] font-bold text-[var(--brand-soft-ink)]">
            1
          </span>
          Student details
        </legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="firstName" required error={errors.firstName}>
            <Input
              id="firstName"
              name="firstName"
              autoComplete="given-name"
              aria-invalid={Boolean(errors.firstName)}
              placeholder="Ahmed"
            />
          </Field>

          <Field label="Last name" htmlFor="lastName" required error={errors.lastName}>
            <Input
              id="lastName"
              name="lastName"
              autoComplete="family-name"
              aria-invalid={Boolean(errors.lastName)}
              placeholder="Khan"
            />
          </Field>

          <Field label="Gender" htmlFor="gender">
            <Select id="gender" name="gender" defaultValue="MALE">
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Prefer not to say</option>
            </Select>
          </Field>

          <Field
            label="Date of birth"
            htmlFor="dateOfBirth"
            required
            error={errors.dateOfBirth}
          >
            <Input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              aria-invalid={Boolean(errors.dateOfBirth)}
            />
          </Field>
        </div>
      </fieldset>

      {/* Guardian details */}
      <fieldset className="space-y-4 border-t border-[var(--line)] pt-6">
        <legend className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
          <span className="flex size-5 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[0.625rem] font-bold text-[var(--brand-soft-ink)]">
            2
          </span>
          Parent or guardian
        </legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Full name"
            htmlFor="guardianName"
            required
            error={errors.guardianName}
          >
            <Input
              id="guardianName"
              name="guardianName"
              autoComplete="name"
              aria-invalid={Boolean(errors.guardianName)}
              placeholder="Tariq Khan"
            />
          </Field>

          <Field label="Relationship to student" htmlFor="guardianRelation">
            <Select id="guardianRelation" name="guardianRelation" defaultValue="FATHER">
              <option value="FATHER">Father</option>
              <option value="MOTHER">Mother</option>
              <option value="GUARDIAN">Guardian</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>

          <Field
            label="Telephone number"
            htmlFor="guardianPhone"
            required
            error={errors.guardianPhone}
            hint="Include the country code, for example +92 300 1234567."
          >
            <Input
              id="guardianPhone"
              name="guardianPhone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              aria-invalid={Boolean(errors.guardianPhone)}
              placeholder="+92 300 1234567"
            />
          </Field>

          <Field
            label="Email address"
            htmlFor="guardianEmail"
            error={errors.guardianEmail}
          >
            <Input
              id="guardianEmail"
              name="guardianEmail"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(errors.guardianEmail)}
              placeholder="tariq@example.com"
            />
          </Field>

          <Field label="Student email (optional)" htmlFor="email" error={errors.email} className="sm:col-span-2">
            <Input
              id="email"
              name="email"
              type="email"
              aria-invalid={Boolean(errors.email)}
              placeholder="Only if the student already has one"
            />
          </Field>

          <Field label="Home address" htmlFor="address" className="sm:col-span-2">
            <Textarea
              id="address"
              name="address"
              rows={2}
              placeholder="House, street, area, city"
            />
          </Field>
        </div>
      </fieldset>

      {/* Programme */}
      <fieldset className="space-y-4 border-t border-[var(--line)] pt-6">
        <legend className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
          <span className="flex size-5 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[0.625rem] font-bold text-[var(--brand-soft-ink)]">
            3
          </span>
          Programme of interest
        </legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Course" htmlFor="courseCode">
            <Select
              id="courseCode"
              name="courseCode"
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
            >
              {courses.map((course) => (
                <option key={course.code} value={course.code}>
                  {course.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Preferred class"
            htmlFor="requestedClass"
            hint="Leave blank if you are unsure."
          >
            {classOptions.length > 0 ? (
              <Select id="requestedClass" name="requestedClass" defaultValue="">
                <option value="">No preference</option>
                {classOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                id="requestedClass"
                name="requestedClass"
                placeholder="For example Grade 9 — A"
              />
            )}
          </Field>

          <Field label="Previous school" htmlFor="previousSchool">
            <Input id="previousSchool" name="previousSchool" placeholder="School name" />
          </Field>

          <Field label="Previous grade or class" htmlFor="previousGrade">
            <Input id="previousGrade" name="previousGrade" placeholder="For example Grade 8" />
          </Field>
        </div>

        <Field
          label="Anything else we should know?"
          htmlFor="message"
          hint="Mention any additional support needs, or your interest in a trial class."
        >
          <Textarea
            id="message"
            name="message"
            rows={3}
            placeholder="Optional"
          />
        </Field>

        <div className="space-y-3 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-4">
          <label className="flex items-start gap-2.5 text-sm text-[var(--ink)]">
            <Checkbox name="trialClassRequested" className="mt-0.5" />
            <span>
              I would like to book a trial class before deciding.
              <span className="mt-0.5 block text-xs text-[var(--ink-subtle)]">
                The office will contact you to arrange a suitable session.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2.5 text-sm text-[var(--ink)]">
            <Checkbox
              name="consentToContact"
              className="mt-0.5"
              aria-invalid={Boolean(errors.consentToContact)}
            />
            <span>
              I confirm the details above are correct and the academy may contact me about
              this application.
              <span className="mt-0.5 block text-xs text-[var(--ink-subtle)]">
                Required. Your details are used only to process this application.
              </span>
            </span>
          </label>

          {errors.consentToContact && (
            <p role="alert" className="text-xs font-medium text-[var(--danger)]">
              {errors.consentToContact}
            </p>
          )}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-5">
        <Button type="submit" size="lg" loading={submitting}>
          {!submitting && <Send />}
          {submitting ? 'Submitting…' : 'Submit application'}
        </Button>
        <Badge tone="neutral">Applications are reviewed within 2 working days</Badge>
      </div>
    </form>
  );
}
