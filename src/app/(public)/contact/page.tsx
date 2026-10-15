import { Clock, Mail, MapPin, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/primitives';
import { Card, PageHeader } from '@/components/ui/structure';
import { getAcademyProfile } from '@/server/settings';
import { getPublicFaqs } from '@/server/public-data';

export const metadata = { title: 'Contact' };

export default async function ContactPage() {
  const [profile, faqs] = await Promise.all([getAcademyProfile(), getPublicFaqs()]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
      <PageHeader
        title="Contact the academy"
        description="Reach the academy office for admissions, fee queries, academic questions or portal access."
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Contact' }]}
      />

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <Card className="p-5">
          <span className="flex size-10 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand-soft-ink)]">
            <Phone className="size-5" />
          </span>
          <h2 className="mt-4 text-sm font-semibold text-[var(--ink)]">Telephone</h2>
          <a
            href={`tel:${profile.phone}`}
            className="mt-1.5 block text-sm text-[var(--brand)] hover:underline"
          >
            {profile.phone}
          </a>
          <p className="mt-2 text-xs text-[var(--ink-subtle)]">
            During office hours for urgent matters.
          </p>
        </Card>

        <Card className="p-5">
          <span className="flex size-10 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent-soft-ink)]">
            <Mail className="size-5" />
          </span>
          <h2 className="mt-4 text-sm font-semibold text-[var(--ink)]">Email</h2>
          <a
            href={`mailto:${profile.email}`}
            className="mt-1.5 block text-sm break-all text-[var(--brand)] hover:underline"
          >
            {profile.email}
          </a>
          <p className="mt-2 text-xs text-[var(--ink-subtle)]">
            Replies usually within one working day.
          </p>
        </Card>

        <Card className="p-5">
          <span className="flex size-10 items-center justify-center rounded-lg bg-[var(--info-soft)] text-[var(--info-soft-ink)]">
            <MapPin className="size-5" />
          </span>
          <h2 className="mt-4 text-sm font-semibold text-[var(--ink)]">Visit us</h2>
          <p className="mt-1.5 text-sm text-[var(--ink-muted)]">{profile.address}</p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--ink)]">
            <Clock className="size-4.5 text-[var(--brand)]" />
            Office hours
          </h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {[
              { day: 'Monday – Thursday', hours: '08:00 – 16:00' },
              { day: 'Friday', hours: '08:00 – 13:00' },
              { day: 'Saturday', hours: '09:00 – 13:00' },
            ].map((row) => (
              <li
                key={row.day}
                className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-2.5 last:border-0"
              >
                <span className="text-[var(--ink-muted)]">{row.day}</span>
                <span className="tabular font-medium text-[var(--ink)]">{row.hours}</span>
              </li>
            ))}
            <li className="flex items-center justify-between gap-3">
              <span className="text-[var(--ink-muted)]">Sunday</span>
              <Badge tone="neutral">Closed</Badge>
            </li>
          </ul>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-semibold text-[var(--ink)]">Portal access</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--ink-muted)]">
            Students, parents and teachers each have a separate portal. If you cannot sign
            in, contact the academy office — for security, passwords are reset by staff
            rather than through an open form.
          </p>
          <ul className="mt-4 space-y-2 text-xs text-[var(--ink-muted)]">
            {[
              'Students sign in with the email address issued at enrolment.',
              'Parents sign in with the email address given on the admission form.',
              'Teachers sign in with their academy email address.',
              'Absence alerts are sent to the verified guardian number on record.',
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--brand)]" />
                {item}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-6 p-6">
        <h2 className="text-base font-semibold text-[var(--ink)]">
          Common questions
        </h2>
        <div className="mt-4 divide-y divide-[var(--line)]">
          {faqs.slice(0, 4).map((faq) => (
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
  );
}
