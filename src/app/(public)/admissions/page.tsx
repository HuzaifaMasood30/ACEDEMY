import { CheckCircle2, ClipboardList, FileText, Mail, Phone, Users } from 'lucide-react';
import { Badge } from '@/components/ui/primitives';
import { Card, PageHeader } from '@/components/ui/structure';
import { getPublicCourses, getPublicFaqs } from '@/server/public-data';
import { getAcademyProfile } from '@/server/settings';
import { AdmissionForm } from './admission-form';

export const metadata = { title: 'Admissions' };

export default async function AdmissionsPage() {
  const [courses, faqs, profile] = await Promise.all([
    getPublicCourses(),
    getPublicFaqs(),
    getAcademyProfile(),
  ]);

  const courseOptions = courses.map((course) => ({
    code: course.code,
    name: course.name,
    classes: course.classSections.map((section) => section.name),
  }));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <PageHeader
        title="Admissions"
        description="Complete the application below and you will receive a reference number immediately. The academy office will contact you to arrange an assessment and interview."
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Admissions' }]}
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-base font-semibold text-[var(--ink)]">
              Online admission application
            </h2>
            <p className="mt-1.5 text-sm text-[var(--ink-muted)]">
              Fields marked with an asterisk are required. Your application is stored
              securely and is only visible to the academy office.
            </p>

            <div className="mt-6">
              <AdmissionForm courses={courseOptions} />
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-base font-semibold text-[var(--ink)]">
              Frequently asked questions
            </h2>
            <div className="mt-4 divide-y divide-[var(--line)]">
              {faqs.map((faq) => (
                <details key={faq.question} className="group py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-[var(--ink)]">
                    {faq.question}
                    <span className="shrink-0 text-[var(--ink-subtle)] transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--ink-muted)]">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-sm font-semibold text-[var(--ink)]">What happens next</h2>
            <ol className="mt-4 space-y-4">
              {[
                {
                  title: 'Submit your application',
                  body: 'You receive a reference number straight away. Keep it for any follow-up.',
                },
                {
                  title: 'The office reviews it',
                  body: 'The academy checks the details and confirms placement availability.',
                },
                {
                  title: 'Assessment and interview',
                  body: 'You are invited to bring your child for a short assessment and a conversation.',
                },
                {
                  title: 'Offer and enrolment',
                  body: 'On acceptance, your child is enrolled, a student ID is issued and portal accounts are created.',
                },
              ].map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[0.6875rem] font-semibold text-[var(--brand-soft-ink)]">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-[var(--ink)]">{step.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-muted)]">
                      {step.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="p-6">
            <h2 className="text-sm font-semibold text-[var(--ink)]">Documents to prepare</h2>
            <ul className="mt-4 space-y-2.5">
              {[
                'Birth certificate or national identity document',
                'Most recent school report or result card',
                'Two passport-sized photographs',
                'Transfer certificate, where applicable',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs text-[var(--ink-muted)]">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[var(--ok)]" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-4 flex items-start gap-2 border-t border-[var(--line)] pt-4 text-xs text-[var(--ink-subtle)]">
              <FileText className="mt-0.5 size-3.5 shrink-0" />
              Documents can be uploaded after the office confirms your application, or
              submitted in person at the academy office.
            </p>
          </Card>

          <Card className="p-6">
            <h2 className="text-sm font-semibold text-[var(--ink)]">Need help?</h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex items-center gap-2.5">
                <Phone className="size-4 shrink-0 text-[var(--brand)]" />
                <a href={`tel:${profile.phone}`} className="text-[var(--ink-muted)] hover:text-[var(--brand)]">
                  {profile.phone}
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="size-4 shrink-0 text-[var(--brand)]" />
                <a href={`mailto:${profile.email}`} className="text-[var(--ink-muted)] hover:text-[var(--brand)]">
                  {profile.email}
                </a>
              </li>
              <li className="flex items-start gap-2.5">
                <Users className="mt-0.5 size-4 shrink-0 text-[var(--brand)]" />
                <span className="text-[var(--ink-muted)]">{profile.address}</span>
              </li>
            </ul>
            <div className="mt-4 flex items-center gap-2 border-t border-[var(--line)] pt-4">
              <Badge tone="info">
                <ClipboardList className="size-3.5" />
                Applications reviewed within 2 working days
              </Badge>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
