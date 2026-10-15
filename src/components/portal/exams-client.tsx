'use client';

import * as React from 'react';
import { CalendarDays, FileSpreadsheet } from 'lucide-react';
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
import { ChildSelector, usePortalContext } from './portal-context';
import { list } from '@/lib/client-api';

interface ExamRow {
  id: string;
  name: string;
  examType: string;
  status: string;
  resultStatus: string;
  startDate: string;
  endDate: string | null;
  publishedAt: string | null;
  academicSession: { name: string } | null;
  _count: { subjects: number };
}

const TYPE_LABEL: Record<string, string> = {
  QUIZ: 'Quiz',
  MONTHLY_TEST: 'Monthly test',
  MIDTERM: 'Mid-term',
  FINAL: 'Final',
  PRACTICAL: 'Practical',
  MOCK: 'Mock test',
  ENTRY_TEST: 'Entry test',
  ASSIGNMENT: 'Assignment',
};

const RESULT_TONE: Record<string, 'success' | 'warning' | 'info' | 'brand'> = {
  PUBLISHED: 'success',
  APPROVED: 'info',
  SUBMITTED: 'info',
  DRAFT: 'brand',
  WITHHELD: 'warning',
};

/** Examination schedule for the focused student's class. */
export function ExamsClient() {
  const context = usePortalContext();
  const [rows, setRows] = React.useState<ExamRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const classSectionId = context.student?.enrollments[0]?.classSection.id;

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await list<ExamRow>('/api/admin/exams', {
        classSectionId: classSectionId || undefined,
        pageSize: 100,
      });
      setRows(result.rows);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load examinations.');
    } finally {
      setLoading(false);
    }
  }, [classSectionId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const now = Date.now();
  const upcoming = rows
    .filter((row) => new Date(row.startDate).getTime() >= now)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  const past = rows
    .filter((row) => new Date(row.startDate).getTime() < now)
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

  const renderTable = (items: ExamRow[]) => (
    <TableWrap>
      <thead>
        <tr>
          <Th>Examination</Th>
          <Th>Type</Th>
          <Th>Date</Th>
          <Th hideBelow="md">Subjects</Th>
          <Th>Result</Th>
        </tr>
      </thead>
      <tbody>
        {items.map((exam) => (
          <Tr key={exam.id}>
            <Td>
              <span className="text-sm font-medium text-[var(--ink)]">{exam.name}</span>
            </Td>
            <Td>
              <Badge tone="brand">{TYPE_LABEL[exam.examType] ?? exam.examType}</Badge>
            </Td>
            <Td>
              <span className="tabular text-sm">
                {new Date(exam.startDate).toLocaleDateString(undefined, {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </Td>
            <Td hideBelow="md">
              <span className="tabular text-sm text-[var(--ink-muted)]">{exam._count.subjects}</span>
            </Td>
            <Td>
              <Badge tone={RESULT_TONE[exam.resultStatus] ?? 'brand'}>
                {exam.resultStatus === 'PUBLISHED'
                  ? 'published'
                  : exam.resultStatus.toLowerCase()}
              </Badge>
            </Td>
          </Tr>
        ))}
      </tbody>
    </TableWrap>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Examinations"
        description={
          context.student
            ? `Exam schedule for ${context.student.firstName} ${context.student.lastName}.`
            : 'Examination schedule.'
        }
        actions={
          <div className="flex items-center gap-2">
            <ChildSelector context={context} />
            <Button variant="ghost" onClick={() => void load()} loading={loading}>
              Refresh
            </Button>
          </div>
        }
      />

      {error && <Alert tone="danger" title="Could not load examinations">{error}</Alert>}

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((index) => (
            <div key={index} className="skeleton h-40 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <div className="p-5">
            <EmptyState
              icon={<FileSpreadsheet />}
              title="No examinations scheduled"
              description="Scheduled tests and examinations will appear here with their dates."
            />
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader
              title="Upcoming"
              description={`${upcoming.length} examination${upcoming.length === 1 ? '' : 's'}`}
              icon={<CalendarDays />}
            />
            {upcoming.length === 0 ? (
              <div className="p-5 text-sm text-[var(--ink-muted)]">
                Nothing scheduled ahead at the moment.
              </div>
            ) : (
              renderTable(upcoming)
            )}
          </Card>

          {past.length > 0 && (
            <Card>
              <CardHeader
                title="Completed"
                description="Marks become visible on the Results page once published."
              />
              {renderTable(past)}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
