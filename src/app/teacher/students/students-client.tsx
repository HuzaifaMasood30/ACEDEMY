'use client';

import * as React from 'react';
import { GraduationCap, Search } from 'lucide-react';
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
import { Alert, Badge, Input } from '@/components/ui/primitives';
import { usePortalContext } from '@/components/portal/portal-context';
import { list } from '@/lib/client-api';

interface StudentRow {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  rollNo: string | null;
  status: string;
  guardianLinks?: {
    relation: string;
    isPrimary: boolean;
    guardianUser: { name: string; phone: string | null };
  }[];
  enrollments?: { classSection: { id: string; name: string } }[];
}

/** Roster of students in the teacher's own classes, with a name search. */
export function StudentsClient() {
  const context = usePortalContext();
  const [students, setStudents] = React.useState<StudentRow[]>([]);
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (context.loading) return;

    let cancelled = false;
    setLoading(true);

    list<StudentRow>('/api/admin/students', { pageSize: 200 })
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
  }, [context.loading]);

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return students;
    return students.filter((student) =>
      `${student.firstName} ${student.lastName} ${student.admissionNo} ${student.rollNo ?? ''}`
        .toLowerCase()
        .includes(term),
    );
  }, [students, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My students"
        description="Students enrolled in the classes you teach."
      />

      {error && <Alert tone="danger" title="Could not load students">{error}</Alert>}

      <Card>
        <CardHeader
          title="Students"
          description={`${filtered.length} of ${students.length} shown`}
          icon={<GraduationCap />}
          action={
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-subtle)]"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name or number"
                aria-label="Search students"
                className="pl-8"
              />
            </div>
          }
        />
        {loading ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="skeleton h-12 rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<GraduationCap />}
              title={search ? 'No matching students' : 'No students'}
              description={
                search
                  ? 'No student in your classes matches that search.'
                  : 'Students appear here once they are enrolled in your classes.'
              }
            />
          </div>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Roll</Th>
                <Th>Student</Th>
                <Th hideBelow="md">Admission no.</Th>
                <Th hideBelow="md">Class</Th>
                <Th hideBelow="lg">Guardian</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((student) => {
                const primary =
                  student.guardianLinks?.find((link) => link.isPrimary) ?? student.guardianLinks?.[0];
                return (
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
                    <Td hideBelow="md">{student.enrollments?.[0]?.classSection.name ?? '—'}</Td>
                    <Td hideBelow="lg">
                      {primary ? (
                        <span className="text-sm text-[var(--ink-muted)]">
                          {primary.guardianUser.name}
                          <span className="ml-1 text-xs text-[var(--ink-subtle)]">
                            ({primary.relation.toLowerCase()})
                          </span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td>
                      <Badge tone={student.status === 'ACTIVE' ? 'success' : 'info'}>
                        {student.status.toLowerCase()}
                      </Badge>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
