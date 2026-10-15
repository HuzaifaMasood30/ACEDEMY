import Link from 'next/link';
import {
  ArrowRight,
  Award,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import { Badge, Button } from '@/components/ui/primitives';
import { Card } from '@/components/ui/structure';
import { getPublicCourses, getPublicNotices, getPublicStats } from '@/server/public-data';
import { getAcademyProfile } from '@/server/settings';
import { formatDate, formatMoney } from '@/lib/format';

export default async function HomePage() {
  const [profile, stats, courses, notices] = await Promise.all([
    getAcademyProfile(),
    getPublicStats(),
    getPublicCourses(),
    getPublicNotices(3),
  ]);

  const featuredCourses = courses.slice(0, 3);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-[var(--line)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
          style={{
            backgroundImage:
              'radial-gradient(circle at 12% 18%, var(--brand-soft) 0%, transparent 42%), radial-gradient(circle at 88% 82%, var(--accent-soft) 0%, transparent 42%)',
          }}
        />
        <div className="surface-grid pointer-events-none absolute inset-0 opacity-[0.14]" aria-hidden />

        <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-24">
          <div>
            <Badge tone="brand" className="mb-5">
              <Sparkles className="size-3.5" />
              Admissions open for the 2026–2027 session
            </Badge>

            <h1 className="text-3xl leading-[1.1] font-semibold tracking-tight text-[var(--ink)] sm:text-4xl lg:text-5xl">
              A modern academy,
              <br />
              <span className="text-[var(--brand)]">run on real data.</span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--ink-muted)]">
              {profile.name} combines classroom teaching with a complete management
              platform. Attendance, timetables, examinations, fee records and progress
              reports all live in one place — for administrators, teachers, students
              and parents.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/admissions">
                <Button size="lg">
                  Apply for admission
                  <ArrowRight />
                </Button>
              </Link>
              <Link href="/courses">
                <Button size="lg" variant="outline">
                  Explore courses
                </Button>
              </Link>
            </div>

            <dl className="mt-10 grid max-w-lg grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
              {[
                { label: 'Active students', value: stats.students },
                { label: 'Faculty members', value: stats.teachers },
                { label: 'Programmes', value: stats.courses },
                { label: 'Running classes', value: stats.classes },
              ].map((item) => (
                <div key={item.label}>
                  <dd className="tabular text-2xl font-semibold tracking-tight text-[var(--ink)]">
                    {item.value}
                  </dd>
                  <dt className="mt-0.5 text-xs text-[var(--ink-subtle)]">{item.label}</dt>
                </div>
              ))}
            </dl>
          </div>

          {/* Layered "3D" visual built from real figures rather than an image */}
          <div className="relative">
            <div className="tilt-card card relative overflow-hidden p-5 shadow-[var(--shadow-lg)]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-[var(--brand)] text-[var(--ink-inverse)]">
                    <GraduationCap className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink)]">
                      Academy at a glance
                    </p>
                    <p className="text-xs text-[var(--ink-subtle)]">Live figures</p>
                  </div>
                </div>
                <Badge tone="success">
                  <span className="size-1.5 rounded-full bg-[var(--ok)]" />
                  Operational
                </Badge>
              </div>

              <div className="mt-5 space-y-3">
                {[
                  { icon: ClipboardCheck, label: 'Daily attendance register', value: 'Recorded per class', tone: 'success' as const },
                  { icon: CalendarClock, label: 'Timetable conflict checks', value: 'Enforced server-side', tone: 'brand' as const },
                  { icon: Wallet, label: 'Fee invoicing', value: 'Transactional', tone: 'accent' as const },
                  { icon: MessageCircle, label: 'WhatsApp alerts', value: 'Queued with retries', tone: 'info' as const },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3.5 py-3"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--surface)] text-[var(--ink-muted)] shadow-[var(--shadow-xs)]">
                      <row.icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--ink)]">
                        {row.label}
                      </p>
                      <p className="text-xs text-[var(--ink-subtle)]">{row.value}</p>
                    </div>
                    <CheckCircle2 className="size-4 shrink-0 text-[var(--ok)]" />
                  </div>
                ))}
              </div>
            </div>

            {/* Floating accent panel */}
            <div className="tilt-card-soft card absolute -bottom-6 -left-4 hidden w-52 p-4 shadow-[var(--shadow-md)] sm:block">
              <p className="text-xs text-[var(--ink-subtle)]">Attendance threshold</p>
              <p className="tabular mt-1 text-xl font-semibold text-[var(--ink)]">75%</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                <div className="h-full w-3/4 rounded-full bg-[var(--brand)]" />
              </div>
              <p className="mt-2 text-[0.6875rem] text-[var(--ink-subtle)]">
                Configurable by the academy
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Portals */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--ink)] sm:text-3xl">
            Four portals, one academy
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--ink-muted)]">
            Every role gets a purpose-built workspace with permissions enforced on the
            server, not just hidden in the interface.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: ShieldCheck,
              title: 'Administration',
              description:
                'Complete control over students, staff, academics, finance, communication and system settings.',
              points: ['Admissions workflow', 'Fee invoicing', 'Audit trail'],
              tone: 'brand' as const,
            },
            {
              icon: BookOpen,
              title: 'Teachers',
              description:
                'Assigned classes, attendance marking, marks entry, assignments and student progress notes.',
              points: ['Daily timetable', 'Marks entry', 'Progress notes'],
              tone: 'accent' as const,
            },
            {
              icon: GraduationCap,
              title: 'Students',
              description:
                'Personal timetable, attendance history, results, assignments and downloadable learning resources.',
              points: ['Results & grades', 'Assignments', 'Resources'],
              tone: 'info' as const,
            },
            {
              icon: Users,
              title: 'Parents',
              description:
                'Follow every child: attendance, results, homework, fee statements and academy announcements.',
              points: ['Multi-child view', 'Fee statements', 'Absence alerts'],
              tone: 'success' as const,
            },
          ].map((portal) => (
            <Card key={portal.title} className="flex flex-col p-5">
              <span
                className={`flex size-10 items-center justify-center rounded-lg ${
                  portal.tone === 'brand'
                    ? 'bg-[var(--brand-soft)] text-[var(--brand-soft-ink)]'
                    : portal.tone === 'accent'
                      ? 'bg-[var(--accent-soft)] text-[var(--accent-soft-ink)]'
                      : portal.tone === 'info'
                        ? 'bg-[var(--info-soft)] text-[var(--info-soft-ink)]'
                        : 'bg-[var(--ok-soft)] text-[var(--ok-soft-ink)]'
                }`}
              >
                <portal.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold text-[var(--ink)]">
                {portal.title}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--ink-muted)]">
                {portal.description}
              </p>
              <ul className="mt-4 space-y-1.5 border-t border-[var(--line)] pt-4">
                {portal.points.map((point) => (
                  <li key={point} className="flex items-center gap-2 text-xs text-[var(--ink-muted)]">
                    <CheckCircle2 className="size-3.5 shrink-0 text-[var(--ok)]" />
                    {point}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      {/* Featured courses */}
      <section className="border-y border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">
                Programmes we offer
              </h2>
              <p className="mt-2 max-w-xl text-sm text-[var(--ink-muted)]">
                From secondary school programmes to intensive entry-test preparation
                and short practical courses.
              </p>
            </div>
            <Link href="/courses">
              <Button variant="outline">
                All courses
                <ArrowRight />
              </Button>
            </Link>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {featuredCourses.map((course) => (
              <Card key={course.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <Badge tone="outline">{course.code}</Badge>
                  <Badge tone="neutral">{course.durationWeeks} weeks</Badge>
                </div>

                <h3 className="mt-3 text-base font-semibold text-[var(--ink)]">
                  {course.name}
                </h3>
                <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-[var(--ink-muted)]">
                  {course.description}
                </p>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {course.courseSubjects.slice(0, 3).map((cs) => (
                    <Badge key={cs.subject.code} tone="neutral">
                      {cs.subject.name}
                    </Badge>
                  ))}
                  {course.courseSubjects.length > 3 && (
                    <Badge tone="neutral">+{course.courseSubjects.length - 3}</Badge>
                  )}
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-[var(--line)] pt-4">
                  <div>
                    <p className="tabular text-lg font-semibold text-[var(--ink)]">
                      {formatMoney(course.baseFee, 'PKR', { compact: true })}
                    </p>
                    <p className="text-[0.6875rem] text-[var(--ink-subtle)]">
                      {course.feeFrequency === 'ONE_TIME'
                        ? 'one-off'
                        : `per ${course.feeFrequency.toLowerCase()}`}
                    </p>
                  </div>
                  <Link href={`/courses#${course.code}`}>
                    <Button variant="soft" size="sm">
                      Details
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Notices */}
      {notices.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">
                Latest notices
              </h2>
              <p className="mt-2 text-sm text-[var(--ink-muted)]">
                Announcements published by the academy office.
              </p>
            </div>
            <Link href="/notices">
              <Button variant="outline">
                All notices
                <ArrowRight />
              </Button>
            </Link>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {notices.map((notice) => (
              <Card key={notice.id} className="p-5">
                <div className="flex items-center gap-2">
                  <Badge tone={notice.priority === 'HIGH' ? 'warning' : 'neutral'}>
                    {notice.category}
                  </Badge>
                  <span className="text-xs text-[var(--ink-subtle)]">
                    {formatDate(notice.publishAt)}
                  </span>
                </div>
                <h3 className="mt-3 text-sm font-semibold text-[var(--ink)]">
                  {notice.title}
                </h3>
                <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-[var(--ink-muted)]">
                  {notice.body}
                </p>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="border-t border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-12 sm:px-6">
          <div className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand-soft-ink)]">
              <Award className="size-5.5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
                Ready to join {profile.name}?
              </h2>
              <p className="mt-1 max-w-xl text-sm text-[var(--ink-muted)]">
                Submit an application online and track its progress. The academy office
                will contact you to arrange an assessment.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/admissions">
              <Button size="lg">
                Start an application
                <ArrowRight />
              </Button>
            </Link>
            <Link href="/contact">
              <Button size="lg" variant="outline">
                Contact the office
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
