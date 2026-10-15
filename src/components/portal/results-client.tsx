'use client';

import * as React from 'react';
import { Award, FileSpreadsheet } from 'lucide-react';
import {
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
  TableWrap,
  Td,
  Th,
  Tr,
} from '@/components/ui/structure';
import { Alert, Badge, Button, Field, Select } from '@/components/ui/primitives';
import { ChildSelector, usePortalContext } from './portal-context';
import { api, list } from '@/lib/client-api';

interface ExamOption {
  id: string;
  name: string;
  examType: string;
  resultStatus: string;
  startDate: string;
  publishedAt: string | null;
}

interface ResultSubject {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  maxMarks: number;
  passMarks: number;
  marksObtained: number | null;
  percentage: number | null;
  grade: string | null;
  gpa: number | null;
  status: string;
  isPass: boolean;
  remarks: string | null;
}

interface ResultCard {
  student: { id: string; admissionNo: string; name: string; rollNo: string | null };
  exam: { id: string; name: string; examType: string; startDate: string; resultStatus: string };
  className: string | null;
  subjects: ResultSubject[];
  totals: {
    obtained: number;
    maximum: number;
    percentage: number | null;
    gpa: number | null;
    grade: string | null;
    rank: number | null;
    passedSubjects: number;
    failedSubjects: number;
    absentSubjects: number;
  };
  overallPass: boolean;
}

/**
 * Published results for a student.
 *
 * Only examinations with a PUBLISHED result status are offered, and the result
 * card endpoint refuses an unpublished one for a non-admin regardless, so
 * unpublished marks can never be read from this page.
 */
export function ResultsClient() {
  const context = usePortalContext();
  const isTeacher = context.scope === 'teacher';

  const [exams, setExams] = React.useState<ExamOption[]>([]);
  const [examId, setExamId] = React.useState('');
  const [card, setCard] = React.useState<ResultCard | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const studentId = context.student?.id;

  React.useEffect(() => {
    let cancelled = false;
    list<ExamOption>('/api/admin/exams', { pageSize: 100 })
      .then((result) => {
        if (cancelled) return;
        const published = result.rows.filter((exam) => exam.resultStatus === 'PUBLISHED');
        setExams(published);
        setExamId((current) => current || published[0]?.id || '');
      })
      .catch(() => {
        if (!cancelled) setExams([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (isTeacher || !studentId || !examId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    api
      .getOne<ResultCard>('/api/admin/exams', { scope: 'resultcard', examId, studentId })
      .then((result) => {
        if (!cancelled) {
          setCard(result);
          setError(null);
        }
      })
      .catch((caught: Error) => {
        if (!cancelled) {
          setCard(null);
          setError(caught.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isTeacher, studentId, examId]);

  if (isTeacher) {
    return (
      <div className="space-y-6">
        <PageHeader title="Results" description="Examination results for your classes." />
        <Alert tone="info" title="Results are published by the administrator">
          Marks you enter become visible to students and guardians only after the administrator
          approves and publishes the examination. Use <strong>Marks entry</strong> to review the marks
          you have submitted.
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Results"
        description={
          context.student
            ? `Published results for ${context.student.firstName} ${context.student.lastName}.`
            : 'Published examination results.'
        }
        actions={<ChildSelector context={context} />}
      />

      {error && (
        <Alert tone={/not been published|not shared|forbidden/i.test(error) ? 'warning' : 'danger'} title="Could not load results">
          {error}
        </Alert>
      )}

      {exams.length === 0 && !loading ? (
        <Card>
          <div className="p-5">
            <EmptyState
              icon={<Award />}
              title="No published results yet"
              description="Results appear here once the administrator publishes an examination. Unpublished marks stay private."
            />
          </div>
        </Card>
      ) : (
        <>
          {exams.length > 0 && (
            <Card>
              <CardHeader title="Examination" description="Choose which result to review." />
              <div className="p-4 sm:p-5">
                <Field label="Examination" htmlFor="res-exam">
                  <Select id="res-exam" value={examId} onChange={(event) => setExamId(event.target.value)}>
                    {exams.map((exam) => (
                      <option key={exam.id} value={exam.id}>
                        {exam.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </Card>
          )}

          {loading ? (
            <div className="space-y-3">
              {[0, 1].map((index) => (
                <div key={index} className="skeleton h-40 rounded-xl" />
              ))}
            </div>
          ) : card ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="Total marks"
                  value={`${card.totals.obtained}/${card.totals.maximum}`}
                  hint={`${card.totals.percentage ?? '—'}%`}
                  icon={<FileSpreadsheet />}
                  tone={card.overallPass ? 'success' : 'danger'}
                />
                <StatCard
                  label="Grade"
                  value={card.totals.grade ?? '—'}
                  hint={card.totals.gpa != null ? `GPA ${card.totals.gpa}` : undefined}
                  tone="success"
                />
                <StatCard
                  label="Subjects passed"
                  value={`${card.totals.passedSubjects}/${card.subjects.length}`}
                  hint={
                    card.totals.failedSubjects > 0
                      ? `${card.totals.failedSubjects} below pass mark`
                      : 'All subjects passed'
                  }
                  tone={card.totals.failedSubjects > 0 ? 'danger' : 'success'}
                />
                <StatCard
                  label="Rank"
                  value={card.totals.rank != null ? `#${card.totals.rank}` : '—'}
                  hint={card.totals.rank == null ? 'Not calculated' : 'In class'}
                />
              </div>

              <Card>
                <CardHeader
                  title={card.exam.name}
                  description={`${card.className ?? 'No class'} · ${card.student.name} · Roll ${
                    card.student.rollNo ?? '—'
                  }`}
                  icon={<Award />}
                />
                <TableWrap>
                  <thead>
                    <tr>
                      <Th>Subject</Th>
                      <Th>Marks</Th>
                      <Th hideBelow="md">Maximum</Th>
                      <Th>Grade</Th>
                      <Th hideBelow="md">GPA</Th>
                      <Th hideBelow="lg">Outcome</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {card.subjects.map((subject) => (
                      <Tr key={subject.subjectId}>
                        <Td>
                          <span className="text-sm font-medium text-[var(--ink)]">
                            {subject.subjectName}
                          </span>
                          <span className="ml-2 text-xs text-[var(--ink-subtle)]">
                            {subject.subjectCode}
                          </span>
                        </Td>
                        <Td>
                          <span className="tabular text-sm font-medium">
                            {subject.status === 'ABSENT'
                              ? 'Absent'
                              : (subject.marksObtained ?? '—')}
                          </span>
                        </Td>
                        <Td hideBelow="md">
                          <span className="tabular text-sm text-[var(--ink-muted)]">
                            {subject.maxMarks}
                          </span>
                        </Td>
                        <Td>{subject.grade ? <Badge tone="brand">{subject.grade}</Badge> : '—'}</Td>
                        <Td hideBelow="md">
                          <span className="tabular text-sm text-[var(--ink-muted)]">
                            {subject.gpa ?? '—'}
                          </span>
                        </Td>
                        <Td hideBelow="lg">
                          {subject.status === 'ABSENT' ? (
                            <Badge tone="warning">absent</Badge>
                          ) : subject.status !== 'SCORED' ? (
                            <Badge tone="info">{subject.status.toLowerCase()}</Badge>
                          ) : subject.isPass ? (
                            <Badge tone="success">pass</Badge>
                          ) : (
                            <Badge tone="danger">below {subject.passMarks}</Badge>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </TableWrap>
                {card.totals.absentSubjects > 0 && (
                  <div className="border-t border-[var(--line)] p-4">
                    <p className="text-xs text-[var(--warn-soft-ink)]">
                      {card.totals.absentSubjects} subject
                      {card.totals.absentSubjects === 1 ? ' was' : 's were'} marked absent.
                    </p>
                  </div>
                )}
              </Card>
            </>
          ) : (
            <Card>
              <div className="p-5">
                <EmptyState
                  icon={<Award />}
                  title="Nothing to show"
                  description="Select a published examination to view its result."
                />
              </div>
            </Card>
          )}
        </>
      )}

      <div className="flex justify-end">
        <Button variant="ghost" onClick={context.reload} loading={context.loading}>
          Refresh
        </Button>
      </div>
    </div>
  );
}
