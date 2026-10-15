'use client';

import * as React from 'react';
import {
  Award,
  BookX,
  CheckCircle2,
  Printer,
  Search,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { Alert, Badge, Button, Field, Input, Select } from '@/components/ui/primitives';
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
import { DataTable, type Column } from '@/components/ui/data-table';
import { Tabs } from '@/components/ui/overlays';
import { ComparisonBarChart } from '@/components/ui/charts';
import { api } from '@/lib/client-api';
import { useResource } from '@/lib/use-resource';
import { formatDate, formatNumber, formatPercent, titleCase } from '@/lib/format';

interface ExamRow {
  id: string;
  name: string;
  examType: string;
  status: string;
  resultStatus: string;
  startDate: string;
  endDate: string;
  publishedAt: string | null;
  academicSession: { name: string };
  _count: { subjects: number };
}

interface StudentRow {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  rollNo: string | null;
}

interface SubjectResult {
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
  isPass: boolean | null;
  remarks: string | null;
}

interface ResultCard {
  student: { id: string; admissionNo: string; name: string; rollNo: string | null };
  exam: {
    id: string;
    name: string;
    examType: string;
    startDate: string;
    endDate: string;
    resultStatus: string;
    publishedAt: string | null;
  };
  className: string | null;
  subjects: SubjectResult[];
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

interface ClassPerformanceRow {
  subjectId: string;
  subjectName: string;
  examId: string;
  maxMarks: number;
  passMarks: number;
  studentCount: number;
  average: number;
  highest: number;
  lowest: number;
  passRate: number;
}

interface FailedRow {
  studentId: string;
  studentName?: string;
  admissionNo?: string;
  subjects?: Array<{ subjectName: string; marksObtained: number | null; passMarks: number }>;
  [key: string]: unknown;
}

const RESULT_TONE: Record<string, 'success' | 'warning' | 'info' | 'neutral' | 'danger'> = {
  PUBLISHED: 'success',
  APPROVED: 'info',
  SUBMITTED: 'warning',
  DRAFT: 'neutral',
  WITHHELD: 'danger',
};

export function ResultsClient() {
  const [tab, setTab] = React.useState<'card' | 'performance' | 'failed'>('card');
  const [examId, setExamId] = React.useState('');
  const [studentId, setStudentId] = React.useState('');
  const [studentSearch, setStudentSearch] = React.useState('');
  const [classSectionId, setClassSectionId] = React.useState('');

  const [card, setCard] = React.useState<ResultCard | null>(null);
  const [cardLoading, setCardLoading] = React.useState(false);
  const [cardError, setCardError] = React.useState<string | null>(null);

  const exams = useResource<ExamRow>('/api/admin/exams', {
    params: { scope: 'exams', pageSize: 100 },
  });

  const classes = useResource<{ id: string; name: string; course: { name: string } }>(
    '/api/admin/classes',
    { params: { pageSize: 100 } },
  );

  const students = useResource<StudentRow>('/api/admin/students', {
    params: { pageSize: 100, q: studentSearch },
    debounceMs: 250,
  });

  const performance = useResource<ClassPerformanceRow>('/api/admin/exams', {
    params: { scope: 'classPerformance', classSectionId },
    enabled: tab === 'performance' && Boolean(classSectionId),
  });

  const failed = useResource<FailedRow>('/api/admin/exams', {
    params: { scope: 'failed', examId },
    enabled: tab === 'failed' && Boolean(examId),
  });

  React.useEffect(() => {
    if (!examId && exams.rows.length) setExamId(exams.rows[0].id);
  }, [exams.rows, examId]);

  React.useEffect(() => {
    if (!classSectionId && classes.rows.length) setClassSectionId(classes.rows[0].id);
  }, [classes.rows, classSectionId]);

  const loadCard = React.useCallback(() => {
    if (!examId || !studentId) {
      setCard(null);
      return;
    }
    setCardLoading(true);
    setCardError(null);
    api
      .getOne<ResultCard>('/api/admin/exams', { scope: 'resultcard', examId, studentId })
      .then(setCard)
      .catch((error: unknown) => {
        setCard(null);
        setCardError(
          error instanceof Error ? error.message : 'Could not build the result card.',
        );
      })
      .finally(() => setCardLoading(false));
  }, [examId, studentId]);

  React.useEffect(() => {
    loadCard();
  }, [loadCard]);

  const print = () => window.print();

  const performanceColumns: Column<ClassPerformanceRow>[] = [
    {
      key: 'subjectName',
      header: 'Subject',
      cell: (row) => <span className="text-sm font-medium text-[var(--ink)]">{row.subjectName}</span>,
    },
    {
      key: 'studentCount',
      header: 'Students',
      align: 'right',
      hideBelow: 'sm',
      cell: (row) => <span className="tabular text-sm">{row.studentCount}</span>,
    },
    {
      key: 'average',
      header: 'Average',
      align: 'right',
      cell: (row) => (
        <span className="tabular text-sm">
          {formatNumber(row.average)} / {row.maxMarks}
        </span>
      ),
    },
    {
      key: 'highest',
      header: 'Highest',
      align: 'right',
      hideBelow: 'md',
      cell: (row) => <span className="tabular text-sm text-[var(--ok)]">{row.highest}</span>,
    },
    {
      key: 'lowest',
      header: 'Lowest',
      align: 'right',
      hideBelow: 'md',
      cell: (row) => (
        <span
          className={`tabular text-sm ${row.lowest < row.passMarks ? 'text-[var(--danger)]' : 'text-[var(--ink)]'}`}
        >
          {row.lowest}
        </span>
      ),
    },
    {
      key: 'passRate',
      header: 'Pass rate',
      align: 'right',
      cell: (row) => (
        <Badge tone={row.passRate >= 90 ? 'success' : row.passRate >= 60 ? 'warning' : 'danger'}>
          {formatPercent(row.passRate)}%
        </Badge>
      ),
    },
  ];

  const failedColumns: Column<FailedRow>[] = [
    {
      key: 'student',
      header: 'Student',
      cell: (row) => (
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium text-[var(--ink)]">
            {String(row.studentName ?? row.studentId ?? '—')}
          </span>
          {row.admissionNo && (
            <span className="tabular block text-[0.6875rem] text-[var(--ink-subtle)]">
              {String(row.admissionNo)}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'subjects',
      header: 'Failed subjects',
      cell: (row) => (
        <div className="flex flex-wrap gap-1.5">
          {(row.subjects ?? []).map((s, i) => (
            <Badge key={i} tone="danger">
              {s.subjectName} ({s.marksObtained ?? 'AB'}/{s.passMarks})
            </Badge>
          ))}
          {(row.subjects ?? []).length === 0 && (
            <span className="text-xs text-[var(--ink-subtle)]">—</span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Results"
        description="Result cards, class performance and failed-subject analysis. Draft results are visible to staff only."
        breadcrumbs={[{ label: 'Academics' }, { label: 'Results' }]}
        actions={
          card && (
            <Button variant="outline" onClick={print} className="print:hidden">
              <Printer />
              Print result card
            </Button>
          )
        }
      />

      <Card className="print:hidden">
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
          <Field label="Examination" htmlFor="res-exam">
            <Select id="res-exam" value={examId} onChange={(e) => setExamId(e.target.value)}>
              {exams.rows.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.name} — {exam.academicSession.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Class" htmlFor="res-class">
            <Select
              id="res-class"
              value={classSectionId}
              onChange={(e) => setClassSectionId(e.target.value)}
            >
              {classes.rows.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Find student"
            htmlFor="res-search"
            hint="Search by name or admission number."
          >
            <Input
              id="res-search"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="e.g. Ayesha or STD-2026"
            />
          </Field>
          <Field label="Student" htmlFor="res-student">
            <Select
              id="res-student"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            >
              <option value="">Choose a student…</option>
              {students.rows.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.firstName} {s.lastName} — {s.admissionNo}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Tabs
        tabs={[
          { value: 'card', label: 'Result card' },
          { value: 'performance', label: 'Class performance' },
          { value: 'failed', label: 'Failed subjects' },
        ]}
        value={tab}
        onChange={(value) => setTab(value as typeof tab)}
      />

      {tab === 'card' && (
        <>
          {cardError && (
            <Alert tone="danger" title="Could not build this result card">
              {cardError}
            </Alert>
          )}

          {cardLoading && (
            <Card>
              <div className="space-y-3 p-5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="skeleton h-10 rounded-lg" />
                ))}
              </div>
            </Card>
          )}

          {!cardLoading && !card && !cardError && (
            <EmptyState
              icon={<Award />}
              title="Choose an examination and a student"
              description="The full result card appears here with subject grades, totals, GPA and rank."
            />
          )}

          {card && !cardLoading && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 print:hidden">
                <StatCard
                  label="Total marks"
                  value={`${formatNumber(card.totals.obtained)} / ${formatNumber(card.totals.maximum)}`}
                  hint={card.totals.percentage != null ? `${formatPercent(card.totals.percentage)}%` : undefined}
                  icon={<TrendingUp />}
                  tone="brand"
                />
                <StatCard
                  label="Grade"
                  value={card.totals.grade ?? '—'}
                  hint={card.totals.gpa != null ? `GPA ${card.totals.gpa}` : undefined}
                  icon={<Award />}
                  tone="accent"
                />
                <StatCard
                  label="Class rank"
                  value={card.totals.rank != null ? `#${card.totals.rank}` : 'Not computed'}
                  hint={card.className ?? undefined}
                  icon={<Award />}
                  tone="info"
                />
                <StatCard
                  label="Overall"
                  value={card.overallPass ? 'Pass' : 'Fail'}
                  hint={`${card.totals.passedSubjects} passed · ${card.totals.failedSubjects} failed · ${card.totals.absentSubjects} absent`}
                  icon={card.overallPass ? <CheckCircle2 /> : <XCircle />}
                  tone={card.overallPass ? 'success' : 'danger'}
                />
              </div>

              <Card>
                <CardHeader
                  title={`${card.student.name} — ${card.exam.name}`}
                  description={`${card.student.admissionNo}${card.student.rollNo ? ` · Roll ${card.student.rollNo}` : ''}${card.className ? ` · ${card.className}` : ''}`}
                  icon={<Award />}
                  action={
                    <Badge tone={RESULT_TONE[card.exam.resultStatus] ?? 'neutral'}>
                      {titleCase(card.exam.resultStatus)}
                    </Badge>
                  }
                />
                <TableWrap>
                  <thead>
                    <tr>
                      <Th>Subject</Th>
                      <Th align="right">Marks</Th>
                      <Th align="right" className="hidden sm:table-cell">
                        Max
                      </Th>
                      <Th align="right" className="hidden sm:table-cell">
                        %
                      </Th>
                      <Th align="center">Grade</Th>
                      <Th align="center" className="hidden md:table-cell">
                        GPA
                      </Th>
                      <Th align="center">Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {card.subjects.map((subject) => (
                      <Tr key={subject.subjectId}>
                        <Td>
                          <span className="text-sm font-medium text-[var(--ink)]">
                            {subject.subjectName}
                          </span>
                          <span className="tabular ml-1.5 text-[0.6875rem] text-[var(--ink-subtle)]">
                            {subject.subjectCode}
                          </span>
                        </Td>
                        <Td align="right">
                          <span className="tabular text-sm">
                            {subject.marksObtained ?? '—'}
                          </span>
                        </Td>
                        <Td align="right" className="hidden sm:table-cell">
                          <span className="tabular text-sm text-[var(--ink-muted)]">
                            {subject.maxMarks}
                          </span>
                        </Td>
                        <Td align="right" className="hidden sm:table-cell">
                          <span className="tabular text-sm">
                            {subject.percentage != null ? `${formatNumber(subject.percentage)}%` : '—'}
                          </span>
                        </Td>
                        <Td align="center">
                          {subject.grade ? (
                            <Badge tone="brand">{subject.grade}</Badge>
                          ) : (
                            <span className="text-xs text-[var(--ink-subtle)]">—</span>
                          )}
                        </Td>
                        <Td align="center" className="hidden md:table-cell">
                          <span className="tabular text-sm text-[var(--ink-muted)]">
                            {subject.gpa ?? '—'}
                          </span>
                        </Td>
                        <Td align="center">
                          {subject.status !== 'SCORED' ? (
                            <Badge tone="warning">{titleCase(subject.status)}</Badge>
                          ) : subject.isPass ? (
                            <Badge tone="success">Pass</Badge>
                          ) : (
                            <Badge tone="danger">Fail</Badge>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </TableWrap>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3 sm:px-5">
                  <div className="text-sm text-[var(--ink-muted)]">
                    Published{' '}
                    {card.exam.publishedAt ? formatDate(card.exam.publishedAt) : 'not yet published'}
                  </div>
                  <div className="tabular text-sm font-semibold text-[var(--ink)]">
                    Total: {formatNumber(card.totals.obtained)} / {formatNumber(card.totals.maximum)}
                    {card.totals.percentage != null && ` (${formatPercent(card.totals.percentage)}%)`}
                  </div>
                </div>
              </Card>
            </>
          )}
        </>
      )}

      {tab === 'performance' && (
        <>
          {performance.error && (
            <Alert tone="danger" title="Could not load class performance">
              {performance.error}
            </Alert>
          )}

          {performance.rows.length > 0 && (
            <Card>
              <CardHeader
                title="Average marks by subject"
                description="Comparison across the subjects examined for the selected class."
                icon={<TrendingUp />}
              />
              <div className="p-4 sm:p-5">
                <ComparisonBarChart
                  data={performance.rows.map((row) => ({
                    subject: row.subjectName,
                    Average: row.average,
                    Pass: row.passMarks,
                  }))}
                  xKey="subject"
                  series={[
                    { key: 'Average', name: 'Class average', colorIndex: 0 },
                    { key: 'Pass', name: 'Pass mark', colorIndex: 4 },
                  ]}
                  height={Math.max(220, performance.rows.length * 44)}
                />
              </div>
            </Card>
          )}

          <DataTable<ClassPerformanceRow>
            columns={performanceColumns}
            rows={performance.rows}
            rowKey={(row) => `${row.examId}-${row.subjectId}`}
            loading={performance.loading}
            emptyTitle="No marks recorded"
            emptyDescription="Performance appears once marks have been entered and saved for this class."
          />
        </>
      )}

      {tab === 'failed' && (
        <>
          {!examId ? (
            <EmptyState
              icon={<BookX />}
              title="Choose an examination"
              description="Select an examination above to see students with failed subjects."
            />
          ) : (
            <>
              {failed.rows.length > 0 && (
                <Alert tone="warning" title={`${failed.rows.length} student(s) with failed subjects`}>
                  These students have at least one subject below the pass mark. Consider an
                  improvement plan — nothing is applied automatically.
                </Alert>
              )}
              <DataTable<FailedRow>
                columns={failedColumns}
                rows={failed.rows}
                rowKey={(row) => String(row.studentId ?? Math.random())}
                loading={failed.loading}
                emptyTitle="No failed subjects"
                emptyDescription="Every recorded result for this examination meets the pass mark."
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
