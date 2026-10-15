import { Mail, Users } from 'lucide-react';
import { Badge } from '@/components/ui/primitives';
import { Avatar } from '@/components/ui/structure';
import { Card, EmptyState, PageHeader } from '@/components/ui/structure';
import { getPublicFaculty } from '@/server/public-data';

export const metadata = { title: 'Faculty' };

export default async function FacultyPage() {
  const faculty = await getPublicFaculty();

  const byDepartment = faculty.reduce<Record<string, typeof faculty>>((acc, member) => {
    const key = member.department ?? 'Faculty';
    acc[key] = acc[key] ?? [];
    acc[key].push(member);
    return acc;
  }, {});

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <PageHeader
        title="Our faculty"
        description="Our teachers are assigned to specific classes and subjects in the management system, which is what determines the student records they can see and update."
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Faculty' }]}
      />

      {faculty.length === 0 ? (
        <EmptyState
          className="mt-10"
          icon={<Users />}
          title="Faculty profiles are not published yet"
          description="Staff profiles will appear here once the academy has added them."
        />
      ) : (
        <div className="mt-10 space-y-10">
          {Object.entries(byDepartment).map(([department, members]) => (
            <section key={department}>
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold tracking-tight text-[var(--ink)]">
                  {department}
                </h2>
                <span className="h-px flex-1 bg-[var(--line)]" aria-hidden />
                <Badge tone="neutral">
                  {members.length} member{members.length === 1 ? '' : 's'}
                </Badge>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {members.map((member) => (
                  <Card key={member.id} className="p-5">
                    <div className="flex items-start gap-3.5">
                      <Avatar name={member.user.name} src={member.user.avatarUrl} size="lg" />
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-[var(--ink)]">
                          {member.user.name}
                        </h3>
                        <p className="mt-0.5 text-xs text-[var(--brand)]">
                          {member.designation ?? 'Faculty member'}
                        </p>
                        {member.qualification && (
                          <p className="mt-1 text-xs text-[var(--ink-subtle)]">
                            {member.qualification}
                          </p>
                        )}
                      </div>
                    </div>

                    {member.specialization && (
                      <p className="mt-4 text-xs leading-relaxed text-[var(--ink-muted)]">
                        Specialisation: {member.specialization}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {member.teacherSubjects.map((ts) => (
                        <Badge key={ts.subject.code} tone="neutral">
                          {ts.subject.name}
                        </Badge>
                      ))}
                    </div>

                    <div className="mt-4 flex items-center gap-1.5 border-t border-[var(--line)] pt-3 text-xs text-[var(--ink-subtle)]">
                      <Mail className="size-3.5" />
                      Contact the academy office to reach this teacher
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
