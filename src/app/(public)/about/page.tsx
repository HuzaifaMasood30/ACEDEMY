import { Award, BookOpen, ShieldCheck, Target, Users } from 'lucide-react';
import { Card, PageHeader, StatCard } from '@/components/ui/structure';
import { Badge } from '@/components/ui/primitives';
import { getPublicStats } from '@/server/public-data';
import { getAcademyProfile } from '@/server/settings';

export const metadata = { title: 'About' };

export default async function AboutPage() {
  const [profile, stats] = await Promise.all([getAcademyProfile(), getPublicStats()]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <PageHeader
        title={`About ${profile.name}`}
        description="A teaching academy supported end to end by a management platform built for how the academy actually runs."
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'About' }]}
      />

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active students" value={stats.students} icon={<Users />} tone="brand" />
        <StatCard label="Faculty members" value={stats.teachers} icon={<Award />} tone="accent" />
        <StatCard label="Programmes" value={stats.courses} icon={<BookOpen />} tone="info" />
        <StatCard label="Running classes" value={stats.classes} icon={<Target />} tone="success" />
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-base font-semibold text-[var(--ink)]">Our approach</h2>
            <div className="mt-4 space-y-4 text-sm leading-relaxed text-[var(--ink-muted)]">
              <p>
                We teach in small groups and track each student&rsquo;s progress continuously
                rather than waiting for the end-of-term report. Attendance is recorded every
                session, assignments are marked promptly, and results are published as soon
                as they have been approved.
              </p>
              <p>
                Everything the academy records is visible to the right people. Students see
                their own timetable, attendance and results. Parents see the same information
                for their own children, along with fee statements and academy notices.
                Teachers see only the classes assigned to them.
              </p>
              <p>
                Where a guardian has consented to WhatsApp notifications, an absence alert
                is sent the same day. Fee reminders, examination schedules and published
                results follow the same channel, with quiet hours respected.
              </p>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-base font-semibold text-[var(--ink)]">
              How the platform supports teaching
            </h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              {[
                {
                  icon: ShieldCheck,
                  title: 'Permissions enforced on the server',
                  body: 'Every request is authorised against the signed-in user\u2019s role and their actual class assignments. Hiding a menu item is never the only protection.',
                },
                {
                  icon: BookOpen,
                  title: 'Attendance that triggers action',
                  body: 'Marking a student absent queues a WhatsApp alert to their verified guardian exactly once, with retries and a delivery log.',
                },
                {
                  icon: Target,
                  title: 'Progress you can act on',
                  body: 'Attendance percentage, subject averages, assignment completion and examination trends combine into transparent alerts for staff and guardians.',
                },
                {
                  icon: Award,
                  title: 'Results with a proper approval trail',
                  body: 'Marks move from draft to submitted, approved, then published. Corrections are recorded with who changed what and why.',
                },
              ].map((item) => (
                <div key={item.title} className="flex gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand-soft-ink)]">
                    <item.icon className="size-4.5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--ink)]">{item.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--ink-muted)]">
                      {item.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-sm font-semibold text-[var(--ink)]">Contact details</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs text-[var(--ink-subtle)]">Address</dt>
                <dd className="mt-0.5 text-[var(--ink-muted)]">{profile.address}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--ink-subtle)]">Telephone</dt>
                <dd className="mt-0.5">
                  <a href={`tel:${profile.phone}`} className="text-[var(--brand)] hover:underline">
                    {profile.phone}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--ink-subtle)]">Email</dt>
                <dd className="mt-0.5">
                  <a href={`mailto:${profile.email}`} className="text-[var(--brand)] hover:underline">
                    {profile.email}
                  </a>
                </dd>
              </div>
            </dl>
          </Card>

          <Card className="p-6">
            <h2 className="text-sm font-semibold text-[var(--ink)]">Office hours</h2>
            <ul className="mt-4 space-y-2 text-sm text-[var(--ink-muted)]">
              <li className="flex justify-between gap-3">
                <span>Monday – Thursday</span>
                <span className="tabular">08:00 – 16:00</span>
              </li>
              <li className="flex justify-between gap-3">
                <span>Friday</span>
                <span className="tabular">08:00 – 13:00</span>
              </li>
              <li className="flex justify-between gap-3">
                <span>Saturday</span>
                <span className="tabular">09:00 – 13:00</span>
              </li>
              <li className="flex justify-between gap-3">
                <span>Sunday</span>
                <Badge tone="neutral">Closed</Badge>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
