'use client';

import * as React from 'react';
import { BookOpen, GraduationCap, Users } from 'lucide-react';
import {
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  TableWrap,
  Td,
  Th,
  Tr,
} from '@/components/ui/structure';
import { Alert, Badge, Button } from '@/components/ui/primitives';
import { usePortalContext } from '@/components/portal/portal-context';
import { list } from '@/lib/client-api';

interface StudentRow {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  rollNo: string | null;
  status: string;
  photoUrl: string | null;
  guardianLinks?: { relation: string; guardianUser: { name: string; phone: string | null } }[];
  enrollments?: { classSection: { id: string; name: string } }[];
}

/** Teacher's class list and roster, limited to classes they are assigned to. */
export function ClassesClient() {
  const context = usePortalContext();
  const [classSectionId, setClassSectionId] = React.useState('');
  const [students, setStudents] = React.useState<StudentRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const classOptions = React.useMemo(
    () => context.classes.map((entry) => entry.classSection),
    [context.classes],
  );

  React.useEffect(() => {
    if (!classSectionId && classOptions.length > 0) setClassSectionId(classOptions[0].id);
  }, [classOptions, classSectionId]);

  React.useEffect(() => {
    if (!classSectionId) {
      setStudents([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    list<StudentRow>('/api/admin/students', { classSectionId, pageSize: 200 })
      .then((result) => {
        if (!cancelled) {
          setStudents(result.rows);
          setError(null);
        }
      })
      .catch((caught: Error) => {
        if (!cancelled) setError(caught.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [classSectionId]);

  const selected = classOptions.find((option) => option.id === classSectionId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My classes"
        description="Classes you teach and the students enrolled in them."
      />

      {error && <Alert tone="danger" title="Could not load students">{error}</Alert>}

      {context.loading ? (
        <div className="skeleton h-24 rounded-xl" />
      ) : classOptions.length === 0 ? (
        <Card>
          <div className="p-5">
            <EmptyState
              icon={<BookOpen />}
              title="No classes assigned"
              description="Ask an administrator to assign you to classes and subjects."
            />
          </div>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {context.classes.map((entry) => (
              <button
                key={entry.classSection.id}
                type="button"
                onClick={() => setClassSectionId(entry.classSection.id)}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  classSectionId === entry.classSection.id
                    ? 'border-[var(--brand)] bg-[var(--brand-soft)]'
                    : 'border-[var(--line)] bg-[var(--surface)] hover:border-[var(--brand)]'
                }`}
              >
                <p className="text-sm font-semibold text-[var(--ink)]">
                  {entry.classSection.name}
                </p>
                <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                  {entry.classSection.course.name}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge tone="brand">
                    <Users className="h-3 w-3" />
                    {entry.classSection._count.enrollments}
                  </Badge>
                  {entry.subjects.slice(0, 2).map((subject) => (
                    <Badge key={subject.id} tone="info">
                      {subject.name}
                    </Badge>
                  ))}
                  {entry.subjects.length > 2 && (
                    <span className="text-xs text-[var(--ink-subtle)]">
                      +{entry.subjects.length - 2}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          <Card>
            <CardHeader
              title={selected ? `Roster — ${selected.name}` : 'Roster'}
              description={`${students.length} student${students.length === 1 ? '' : 's'}`}
              icon={<GraduationCap />}
            />
            {loading ? (
              <div className="space-y-2 p-5">
                {[0, 1, 2, 3].map((index) => (
                  <div key={index} className="skeleton h-12 rounded-lg" />
                ))}
              </div>
            ) : students.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<GraduationCap />}
                  title="No students enrolled"
                  description="This class has no active enrolments yet."
                />
              </div>
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Roll</Th>
                    <Th>Student</Th>
                    <Th hideBelow="md">Admission no.</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <Tr key={student.id}>
                      <Td>
                        <span className="tabular text-sm text-[var(--ink-muted)]">
                          {student.rollNo ?? '—'}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-sm font-medium text-[var(--ink)]">
                          {student.firstName} {student.lastName}
                        </span>
                      </Td>
                      <Td hideBelow="md">
                        <span className="tabular text-sm text-[var(--ink-muted)]">
                          {student.admissionNo}
                        </span>
                      </Td>
                      <Td>
                        <Badge tone={student.status === 'ACTIVE' ? 'success' : 'info'}>
                          {student.status.toLowerCase()}
                        </Badge>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
