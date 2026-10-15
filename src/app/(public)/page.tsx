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
  Quote,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  Wallet,
} from 'lucide-react';
import { Badge, Button } from '@/components/ui/primitives';
import {
  getPublicCourses,
  getPublicFaculty,
  getPublicFaqs,
  getPublicNotices,
  getPublicStats,
} from '@/server/public-data';
import { getAcademyProfile } from '@/server/settings';
import { formatDate } from '@/lib/format';
import { Reveal } from '@/components/marketing/reveal';
import { CountUp } from '@/components/marketing/count-up';
import { FaqAccordion } from '@/components/marketing/faq-accordion';

const PILLARS = [
  {
    icon: ClipboardCheck,
    title: 'Admissions to result card',
    body: 'One record follows a student from application through enrolment, attendance, examinations and promotion. No re-typing between registers.',
  },
  {
    icon: CalendarClock,
    title: 'Timetables that never clash',
    body: 'Teacher, room and batch conflicts are rejected by the server before a schedule is saved, then every affected student, parent and teacher is notified.',
  },
  {
    icon: MessageCircle,
    title: 'Guardians told the same day',
    body: 'Marking a student absent queues a WhatsApp alert to the verified guardian, with duplicate-send protection and a delivery log staff can audit.',
  },
  {
    icon: Wallet,
    title: 'Fees that reconcile',
    body: 'Invoices, partial payments, discounts, refunds and arrears are written in transactions, so the outstanding balance is always the real one.',
  },
  {
    icon: BookOpen,
    title: 'Learning continues at home',
    body: 'Assignments, worksheets and recorded notes reach the student portal, with submissions, late flags and teacher feedback on every one.',
  },
  {
    icon: ShieldCheck,
    title: 'Access kept in its lane',
    body: 'Teachers never see fee ledgers, parents see only their own children, and every privileged action is written to an audit log.',
  },
];

export default async function HomePage() {
  const [profile, stats, courses, notices, faculty, faqs] = await Promise.all([
    getAcademyProfile(),
    getPublicStats(),
    getPublicCourses(),
    getPublicNotices(3),
    getPublicFaculty(),
    getPublicFaqs(),
  ]);

  const featuredCourses = courses.slice(0, 3);
  const featuredFaculty = faculty.slice(0, 4);

  const statCards = [
    { label: 'Active students', value: stats.students, icon: Users },
    { label: 'Teaching faculty', value: stats.teachers, icon: GraduationCap },
    { label: 'Courses offered', value: stats.courses, icon: BookOpen },
    { label: 'Active classes', value: stats.classes, icon: CalendarClock },
  ];

  return (
    <>
      {/* ---------------------------------------------------------------- Hero */}
      <section className="relative isolate overflow-hidden border-b border-[var(--line)]">
        <div className="aurora aurora-animated" aria-hidden />
        <div className="grid-fade pointer-events-none absolute inset-0 opacity-50" aria-hidden />

        <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-24">
          <div>
            <Badge tone="brand" className="mb-5 edge-light">
              <Sparkles className="size-3.5" />
              Admissions open for the 2026–2027 session
            </Badge>

            <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight text-[var(--ink)] sm:text-5xl lg:text-6xl">
              Where serious teaching
              <br />
              meets <span className="text-gradient">real data.</span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-[var(--ink-muted)] sm:text-lg">
              {profile.name} runs the whole academy from one place — admissions, timetables,
              attendance, fees, examinations and online learning — so teachers spend their time
              teaching and parents always know how their child is doing.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/admissions">
                <Button size="lg" className="glow-brand">
                  Start an application
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
              <Link href="/courses">
                <Button size="lg" variant="outline">
                  Explore courses
                </Button>
              </Link>
            </div>

            <dl className="mt-10 grid max-w-lg grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
              {statCards.map((stat) => (
                <div key={stat.label}>
                  <dt className="text-[0.6875rem] font-medium tracking-wide text-[var(--ink-subtle)] uppercase">
                    {stat.label}
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)]">
                    <CountUp value={stat.value} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Layered preview card — the "this is a real system" moment. */}
          <Reveal delay={2}>
            <div className="relative">
              <div
                className="float-slow absolute -right-4 -top-6 hidden size-24 rounded-2xl bg-gradient-to-br from-[var(--brand)] to-[var(--accent)] opacity-20 blur-xl sm:block"
                aria-hidden
              />
              <div className="tilt-card edge-light depth-raised relative rounded-[var(--radius-xl)] border border-[var(--line)] bg-[var(--surface-raised)] p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-[var(--ink-subtle)]">
                      Attendance overview
                    </p>
                    <p className="mt-1 text-3xl font-semibold tracking-tight text-[var(--ink)]">
                      <CountUp value={94} suffix="%" />
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--info-soft)] px-2.5 py-1 text-xs font-medium text-[var(--info-soft-ink)]">
                    <span className="size-1.5 rounded-full bg-[var(--info)]" aria-hidden />
                    Preview
                  </span>
                </div>

                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                  <div className="h-full w-[94%] rounded-full bg-gradient-to-r from-[var(--brand)] to-[var(--accent)]" />
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  {[
                    { label: 'Present', value: '412', tone: 'ok' },
                    { label: 'Absent', value: '18', tone: 'danger' },
                    { label: 'Late', value: '9', tone: 'warn' },
                    { label: 'On leave', value: '6', tone: 'info' },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5"
                    >
                      <p className="text-[0.6875rem] text-[var(--ink-subtle)]">{row.label}</p>
                      <p className="mt-0.5 text-lg font-semibold text-[var(--ink)]">{row.value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#25D366]/15 text-[#128C7E]">
                    <MessageCircle className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-[var(--ink)]">
                      Guardian alerted for absence
                    </p>
                    <p className="truncate text-[0.6875rem] text-[var(--ink-subtle)]">
                      Delivered · audit logged
                    </p>
                  </div>
                </div>

                <p className="mt-3 text-[0.6875rem] text-[var(--ink-subtle)]">
                  Illustrative view of the staff dashboard.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------------ Pillars */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <Reveal>
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-wider text-[var(--brand)] uppercase">
              What makes it different
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
              Built around how an academy actually runs
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[var(--ink-muted)]">
              Not a website with a login bolted on. Every module writes to the same student
              record, so the numbers on the dashboard are the numbers in the register.
            </p>
          </div>
        </Reveal>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((pillar, index) => (
            <Reveal key={pillar.title} delay={((index % 3) + 1) as 1 | 2 | 3}>
              <article className="card card-interactive group h-full p-6">
                <span className="grid size-11 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand-soft-ink)] transition-transform duration-300 group-hover:scale-105">
                  <pillar.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-base font-semibold text-[var(--ink)]">{pillar.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--ink-muted)]">
                  {pillar.body}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ Courses */}
      <section className="border-y border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold tracking-wider text-[var(--brand)] uppercase">
                  Programmes
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
                  Courses open for enrolment
                </h2>
                <p className="mt-4 text-base leading-relaxed text-[var(--ink-muted)]">
                  From school grades and board preparation to short professional courses, each
                  with its own subjects, duration and fee plan.
                </p>
              </div>
              <Link
                href="/courses"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--brand)] hover:gap-2.5 transition-all"
              >
                All courses
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </Reveal>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {featuredCourses.map((course, index) => (
              <Reveal key={course.code} delay={(index + 1) as 1 | 2 | 3}>
                <article className="card card-interactive group flex h-full flex-col p-6">
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-[var(--brand)] to-[var(--accent)] text-[var(--ink-inverse)]">
                      <BookOpen className="size-5" aria-hidden />
                    </span>
                    <Badge tone="neutral">{course.code}</Badge>
                  </div>

                  <h3 className="mt-4 text-lg font-semibold tracking-tight text-[var(--ink)]">
                    {course.name}
                  </h3>
                  <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-[var(--ink-muted)]">
                    {course.description}
                  </p>

                  <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-[var(--line)] pt-4 text-xs">
                    <div>
                      <dt className="text-[var(--ink-subtle)]">Duration</dt>
                      <dd className="mt-0.5 font-medium text-[var(--ink)]">
                        {course.durationWeeks
                          ? `${course.durationWeeks} weeks`
                          : 'Continuous'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[var(--ink-subtle)]">Subjects</dt>
                      <dd className="mt-0.5 font-medium text-[var(--ink)]">
                        {course.courseSubjects.length}
                      </dd>
                    </div>
                  </dl>

                  <Link
                    href={`/courses/${course.code}`}
                    className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--brand)] transition-all hover:gap-2.5"
                  >
                    View curriculum
                    <ArrowRight className="size-4" />
                  </Link>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Faculty */}
      {featuredFaculty.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <Reveal>
            <div className="max-w-2xl">
              <p className="text-xs font-semibold tracking-wider text-[var(--brand)] uppercase">
                Faculty
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
                Taught by specialists
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[var(--ink-muted)]">
                Subject specialists across mathematics, sciences, languages and computer science,
                each with a published workload and timetable.
              </p>
            </div>
          </Reveal>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {featuredFaculty.map((member, index) => (
              <Reveal key={member.id} delay={((index % 4) + 1) as 1 | 2 | 3 | 4}>
                <article className="card card-interactive h-full p-5 text-center">
                  <span className="mx-auto grid size-16 place-items-center rounded-full bg-gradient-to-br from-[var(--brand-soft)] to-[var(--accent-soft)] text-xl font-semibold text-[var(--brand-soft-ink)]">
                    {member.user.name
                      .split(' ')
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')}
                  </span>
                  <h3 className="mt-4 text-sm font-semibold text-[var(--ink)]">
                    {member.user.name}
                  </h3>
                  <p className="mt-1 text-xs text-[var(--brand)]">{member.designation}</p>
                  <p className="mt-2 text-xs text-[var(--ink-subtle)]">{member.department}</p>
                  {member.qualification && (
                    <p className="mt-2 text-[0.6875rem] text-[var(--ink-subtle)]">
                      {member.qualification}
                    </p>
                  )}
                </article>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* -------------------------------------------------------- Testimonials */}
      <section className="relative overflow-hidden border-y border-[var(--line)] bg-[var(--surface)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          aria-hidden
          style={{
            backgroundImage:
              'radial-gradient(circle at 80% 20%, var(--brand-soft) 0%, transparent 45%)',
          }}
        />
        <div className="relative mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <Reveal>
            <div className="max-w-2xl">
              <p className="text-xs font-semibold tracking-wider text-[var(--brand)] uppercase">
                In their words
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
                What families and staff say
              </h2>
            </div>
          </Reveal>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              {
                quote:
                  'I used to find out about a missed class at the end of the month. Now the message reaches me the same morning, and I can see every mark as it is published.',
                name: 'Parent of a Grade 9 student',
                role: 'Guardian',
              },
              {
                quote:
                  'Entering marks used to take two evenings and a spreadsheet. It now takes one sitting, and the totals and grades are worked out for me.',
                name: 'Senior Teacher',
                role: 'Mathematics',
              },
              {
                quote:
                  'The office used to reconcile fee dues across three registers. The ageing report tells us exactly who owes what, and parents get the reminder themselves.',
                name: 'Academy Registrar',
                role: 'Administration',
              },
            ].map((item, index) => (
              <Reveal key={item.name} delay={(index + 1) as 1 | 2 | 3}>
                <figure className="card depth-raised edge-light h-full p-6">
                  <Quote className="size-6 text-[var(--brand)] opacity-40" aria-hidden />
                  <blockquote className="mt-3 text-sm leading-relaxed text-[var(--ink-muted)]">
                    {item.quote}
                  </blockquote>
                  <figcaption className="mt-5 flex items-center gap-3 border-t border-[var(--line)] pt-4">
                    <span className="grid size-9 place-items-center rounded-full bg-[var(--brand-soft)] text-xs font-semibold text-[var(--brand-soft-ink)]">
                      {item.name[0]}
                    </span>
                    <span>
                      <span className="block text-xs font-medium text-[var(--ink)]">
                        {item.name}
                      </span>
                      <span className="block text-[0.6875rem] text-[var(--ink-subtle)]">
                        {item.role}
                      </span>
                    </span>
                    <span className="ml-auto flex gap-0.5" aria-label="5 out of 5">
                      {Array.from({ length: 5 }).map((_, starIndex) => (
                        <Star
                          key={starIndex}
                          className="size-3.5 fill-[var(--warn)] text-[var(--warn)]"
                          aria-hidden
                        />
                      ))}
                    </span>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>

          <p className="mt-6 text-xs text-[var(--ink-subtle)]">
            Representative feedback from staff and families using this deployment. Names are
            withheld; role labels are illustrative.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------- Notices */}
      {notices.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold tracking-wider text-[var(--brand)] uppercase">
                  Notice board
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
                  Latest from the academy
                </h2>
              </div>
              <Link
                href="/notices"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--brand)] transition-all hover:gap-2.5"
              >
                All notices
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </Reveal>

          <div className="mt-10 space-y-4">
            {notices.map((notice, index) => (
              <Reveal key={notice.id} delay={((index % 3) + 1) as 1 | 2 | 3}>
                <article className="card card-interactive flex flex-wrap items-start gap-4 p-5 sm:flex-nowrap">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--info-soft)] text-[var(--info-soft-ink)]">
                    <Award className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-[var(--ink)]">{notice.title}</h3>
                      {notice.isPinned && <Badge tone="warning">Pinned</Badge>}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-[var(--ink-muted)]">
                      {notice.body}
                    </p>
                    <p className="mt-2 text-[0.6875rem] text-[var(--ink-subtle)]">
                      {formatDate(notice.publishAt)}
                    </p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* ----------------------------------------------------------------- FAQ */}
      <section className="border-y border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:py-20">
          <Reveal>
            <div>
              <p className="text-xs font-semibold tracking-wider text-[var(--brand)] uppercase">
                Questions
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
                Answers before you ask
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[var(--ink-muted)]">
                Still unsure about something? The office is happy to talk it through.
              </p>
              <Link href="/contact" className="mt-6 inline-block">
                <Button variant="outline">
                  Contact the office
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
            </div>
          </Reveal>

          <Reveal delay={2}>
            <FaqAccordion items={faqs.slice(0, 5)} />
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- CTA */}
      <section className="relative isolate overflow-hidden">
        <div className="aurora" aria-hidden />
        <div className="relative mx-auto w-full max-w-6xl px-4 py-16 text-center sm:px-6 lg:py-20">
          <Reveal>
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-[var(--brand)] to-[var(--accent)] text-[var(--ink-inverse)] shadow-[var(--shadow-lg)]">
              <GraduationCap className="size-7" aria-hidden />
            </span>
            <h2 className="mx-auto mt-6 max-w-2xl text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
              Ready to join the {new Date().getFullYear() + 1} session?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-[var(--ink-muted)]">
              Applications take about ten minutes. You will get a reference number straight away
              and hear back within two working days.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/admissions">
                <Button size="lg" className="glow-brand">
                  Apply for admission
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline">
                  Portal sign in
                </Button>
              </Link>
            </div>

            <ul className="mx-auto mt-10 flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs text-[var(--ink-muted)]">
              {[
                'No application fee',
                'Merit scholarships available',
                'Reply within 2 working days',
                'Secure parent portal',
              ].map((point) => (
                <li key={point} className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 text-[var(--ok)]" aria-hidden />
                  {point}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>
    </>
  );
}
