import Link from 'next/link';
import { ArrowRight, BookOpen, Clock, GraduationCap, Users } from 'lucide-react';
import { Badge, Button } from '@/components/ui/primitives';
import { Card, EmptyState, PageHeader } from '@/components/ui/structure';
import { getPublicCourses } from '@/server/public-data';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Courses' };

export default async function CoursesPage() {
  const courses = await getPublicCourses();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <PageHeader
        title="Courses and programmes"
        description="Every programme below is configured in the academy management system, including its subjects, duration and fee plan. Course content, fees and structure can be changed by the academy without any code changes."
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Courses' }]}
        actions={
          <Link href="/admissions">
            <Button>
              Apply now
              <ArrowRight />
            </Button>
          </Link>
        }
      />

      {courses.length === 0 ? (
        <EmptyState
          className="mt-10"
          icon={<BookOpen />}
          title="No courses are published yet"
          description="The academy has not published any programmes. Please check back shortly or contact the office."
        />
      ) : (
        <div className="mt-10 space-y-6">
          {courses.map((course) => (
            <Card key={course.id} id={course.code} className="scroll-mt-24 overflow-hidden">
              <div className="grid gap-0 lg:grid-cols-[1fr_18rem]">
                <div className="p-5 sm:p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="brand">{course.code}</Badge>
                    <Badge tone="neutral">
                      <Clock className="size-3.5" />
                      {course.durationWeeks} weeks
                    </Badge>
                    {course.certificateEligible && (
                      <Badge tone="success">
                        <GraduationCap className="size-3.5" />
                        Certificate on completion
                      </Badge>
                    )}
                    <Badge tone="outline">
                      <Users className="size-3.5" />
                      {course._count.classSections} active class
                      {course._count.classSections === 1 ? '' : 'es'}
                    </Badge>
                  </div>

                  <h2 className="mt-4 text-lg font-semibold tracking-tight text-[var(--ink)]">
                    {course.name}
                  </h2>

                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--ink-muted)]">
                    {course.description}
                  </p>

                  <div className="mt-5">
                    <h3 className="text-xs font-semibold tracking-wide text-[var(--ink-subtle)] uppercase">
                      Subjects covered
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {course.courseSubjects.map((cs) => (
                        <Badge key={cs.subject.code} tone="neutral">
                          {cs.subject.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col justify-between gap-4 border-t border-[var(--line)] bg-[var(--surface-sunken)] p-5 sm:p-6 lg:border-t-0 lg:border-l">
                  <div>
                    <p className="text-xs font-medium tracking-wide text-[var(--ink-subtle)] uppercase">
                      Fee plan
                    </p>
                    <p className="tabular mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)]">
                      {formatMoney(course.baseFee, 'PKR', { compact: true })}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                      {course.feeFrequency === 'ONE_TIME'
                        ? 'one-off payment'
                        : course.feeFrequency === 'TERM'
                          ? 'per term'
                          : course.feeFrequency === 'ANNUAL'
                            ? 'per year'
                            : `per ${course.feeFrequency.toLowerCase().replace('ly', '')}`}
                    </p>
                    <p className="mt-2 text-[0.6875rem] leading-relaxed text-[var(--ink-subtle)]">
                      Examination and material charges are itemised separately on each
                      invoice.
                    </p>
                  </div>

                  {course.classSections.length > 0 && (
                    <div>
                      <p className="text-xs font-medium tracking-wide text-[var(--ink-subtle)] uppercase">
                        Classes
                      </p>
                      <ul className="mt-1.5 space-y-1 text-xs text-[var(--ink-muted)]">
                        {course.classSections.slice(0, 4).map((section) => {
                          const enrolled = section._count.enrollments;
                          const seatsLeft = Math.max(0, section.capacity - enrolled);
                          return (
                            <li key={section.id} className="flex items-center justify-between gap-2">
                              <span className="truncate">{section.name}</span>
                              <span
                                className={
                                  seatsLeft === 0
                                    ? 'text-[var(--danger)]'
                                    : seatsLeft <= 5
                                      ? 'text-[var(--warn)]'
                                      : 'text-[var(--ink-subtle)]'
                                }
                              >
                                {seatsLeft === 0 ? 'Full' : `${seatsLeft} places`}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  <Link href="/admissions" className="block">
                    <Button className="w-full">
                      Apply for this course
                      <ArrowRight />
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-10 p-6">
        <h2 className="text-base font-semibold text-[var(--ink)]">
          How the academy configures its structure
        </h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-3">
          {[
            {
              title: 'Sessions and terms',
              body: 'Each academic session has its own terms, calendar and holidays. Records from a previous session remain intact when the new one begins.',
            },
            {
              title: 'Classes and batches',
              body: 'A course can run as several classes, each with its own section, capacity, class teacher and batch groups.',
            },
            {
              title: 'Grading scales',
              body: 'Grade boundaries, GPA values and pass marks are configurable per examination, so different programmes can be marked differently.',
            },
          ].map((item) => (
            <div key={item.title}>
              <h3 className="text-sm font-semibold text-[var(--ink)]">{item.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-muted)]">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
