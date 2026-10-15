'use client';

import * as React from 'react';
import { AlertTriangle, Award, NotebookPen, TrendingDown, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
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
import { Alert, Badge, Button, Progress } from '@/components/ui/primitives';
import { ChildSelector, usePortalContext } from './portal-context';
import { api, list } from '@/lib/client-api';

interface TrendPoint {
  examId: string;
  examName: string;
  percentage: number;
  date: string;
}

interface SubjectProgress {
  subjectId: string;
  subjectName: string;
  assessments: number;
  averagePercentage: number | null;
  latestPercentage: number | null;
  trendDelta: number | null;
  assignmentCompletionRate: number | null;
  assignmentsDue: number;
  assignmentsSubmitted: number;
  assignmentsOverdue: number;
}

interface ProgressAlert {
  code: string;
  severity: string;
  title: string;
  detail: string;
}

interface Achievement {
  code: string;
  label: string;
  detail: string;
}

interface StudentProgressProfile {
  student: {
    id: string;
    admissionNo: string;
    name: string;
    status: string;
    className: string | null;
    courseName: string | null;
    sessionName: string | null;
  };
  attendance: {
    percentage: number;
    totalSessions: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    leaveApproved: number;
    consecutiveAbsences: number;
    belowThreshold: boolean;
    threshold: number;
  };
  academics: {
    examCount: number;
    averagePercentage: number | null;
    latestPercentage: number | null;
    trend: TrendPoint[];
    strongestSubjects: { subjectName: string; percentage: number }[];
    weakestSubjects: { subjectName: string; percentage: number }[];
  };
  subjects: SubjectProgress[];
  assignments: {
    total: number;
    submitted: number;
    graded: number;
    late: number;
    missing: number;
    completionRate: number | null;
    averageScore: number | null;
  };
  fees?: {
    totalInvoiced: number;
    totalPaid: number;
    outstanding: number;
    overdue: number;
    openInvoices: number;
  };
  alerts: ProgressAlert[];
  achievements: Achievement[];
}

interface ProgressNote {
  id: string;
  category: string;
  visibility: string;
  body: string;
  createdAt: string;
  author?: { name: string } | null;
}

function toneForPercentage(value: number | null): 'success' | 'warning' | 'danger' | 'brand' {
  if (value == null) return 'brand';
  if (value >= 60) return 'success';
  if (value >= 40) return 'warning';
  return 'danger';
}

/**
 * Continuous progress view.
 *
 * Combines attendance, marks and assignment completion. Alerts are presented as
 * information for staff and guardians, never as an automatic judgement.
 */
export function ProgressClient() {
  const context = usePortalContext();
  const isTeacher = context.scope === 'teacher';

  if (isTeacher) return <TeacherProgress />;

  return <StudentProgressView />;
}

function StudentProgressView() {
  const context = usePortalContext();
  const [profile, setProfile] = React.useState<StudentProgressProfile | null>(null);
  const [notes, setNotes] = React.useState<ProgressNote[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const studentId = context.student?.id;

  React.useEffect(() => {
    if (!studentId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all([
      api.getOne<StudentProgressProfile>('/api/admin/progress', { scope: 'student', studentId }),
      list<ProgressNote>('/api/admin/progress', { scope: 'notes', studentId, pageSize: 50 }),
    ])
      .then(([progress, noteRows]) => {
        if (cancelled) return;
        setProfile(progress);
        setNotes(noteRows.rows);
        setError(null);
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
  }, [studentId]);

  if (loading && !profile) {
    return (
      <div className="space-y-6">
        <PageHeader title="Progress" description="Loading the student's progress profile." />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="skeleton h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Progress" actions={<ChildSelector context={context} />} />
        <Alert tone="danger" title="Could not load progress">{error}</Alert>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="space-y-6">
        <PageHeader title="Progress" actions={<ChildSelector context={context} />} />
        <Card>
          <div className="p-5">
            <EmptyState
              icon={<TrendingUp />}
              title="No progress data"
              description="Progress builds up as attendance, marks and assignments are recorded."
            />
          </div>
        </Card>
      </div>
    );
  }

  const { attendance, academics, assignments } = profile;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Progress"
        description={`${profile.student.name} · ${profile.student.className ?? 'No class'} · ${
          profile.student.sessionName ?? ''
        }`}
        actions={<ChildSelector context={context} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Attendance"
          value={`${attendance.percentage}%`}
          hint={`${attendance.present} of ${attendance.totalSessions} sessions · minimum ${attendance.threshold}%`}
          tone={attendance.belowThreshold ? 'danger' : 'success'}
        />
        <StatCard
          label="Average marks"
          value={academics.averagePercentage != null ? `${academics.averagePercentage}%` : '—'}
          hint={
            academics.latestPercentage != null
              ? `Latest exam ${academics.latestPercentage}%`
              : `${academics.examCount} exams`
          }
          icon={<TrendingUp />}
          tone={toneForPercentage(academics.averagePercentage)}
        />
        <StatCard
          label="Assignments"
          value={
            assignments.completionRate != null ? `${assignments.completionRate}%` : '—'
          }
          hint={`${assignments.total - assignments.missing} of ${assignments.total} completed`}
          tone={assignments.missing > 0 ? 'danger' : 'success'}
        />
        <StatCard
          label="Consecutive absences"
          value={attendance.consecutiveAbsences}
          hint={attendance.consecutiveAbsences > 0 ? 'Needs attention' : 'None recorded'}
          tone={attendance.consecutiveAbsences >= 3 ? 'danger' : undefined}
        />
      </div>

      {profile.alerts.length > 0 && (
        <Card>
          <CardHeader
            title="Things to watch"
            description="Transparent alerts for staff and guardians — not automatic decisions."
            icon={<AlertTriangle />}
          />
          <ul className="divide-y divide-[var(--line)]">
            {profile.alerts.map((alert) => (
              <li key={alert.code} className="flex items-start gap-3 p-4">
                <Badge
                  tone={
                    alert.severity === 'HIGH' ? 'danger' : alert.severity === 'MEDIUM' ? 'warning' : 'info'
                  }
                >
                  {alert.severity.toLowerCase()}
                </Badge>
                <div>
                  <p className="text-sm font-medium text-[var(--ink)]">{alert.title}</p>
                  <p className="text-xs text-[var(--ink-muted)]">{alert.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {profile.achievements.length > 0 && (
        <Card>
          <CardHeader title="Achievements" icon={<Award />} />
          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
            {profile.achievements.map((achievement) => (
              <div
                key={achievement.code}
                className="flex items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-3"
              >
                <Award className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-soft-ink)]" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-[var(--ink)]">{achievement.label}</p>
                  <p className="text-xs text-[var(--ink-muted)]">{achievement.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {academics.trend.length > 1 && (
        <Card>
          <CardHeader title="Examination trend" description="Average percentage across each examination." />
          <TableWrap>
            <thead>
              <tr>
                <Th>Examination</Th>
                <Th>Date</Th>
                <Th>Average</Th>
                <Th hideBelow="md">Change</Th>
              </tr>
            </thead>
            <tbody>
              {academics.trend.map((point, index) => {
                const previous = index > 0 ? academics.trend[index - 1].percentage : null;
                const delta = previous != null ? point.percentage - previous : null;
                return (
                  <Tr key={point.examId}>
                    <Td>{point.examName}</Td>
                    <Td>
                      <span className="tabular text-sm text-[var(--ink-muted)]">
                        {new Date(point.date).toLocaleDateString(undefined, {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </span>
                    </Td>
                    <Td>
                      <span className="tabular text-sm font-medium">{point.percentage}%</span>
                    </Td>
                    <Td hideBelow="md">
                      {delta == null ? (
                        '—'
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 tabular text-sm ${
                            delta >= 0 ? 'text-[var(--ok-soft-ink)]' : 'text-[var(--danger-soft-ink)]'
                          }`}
                        >
                          {delta >= 0 ? (
                            <TrendingUp className="h-3.5 w-3.5" />
                          ) : (
                            <TrendingDown className="h-3.5 w-3.5" />
                          )}
                          {delta >= 0 ? '+' : ''}
                          {delta.toFixed(1)}%
                        </span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </TableWrap>
        </Card>
      )}

      <Card>
        <CardHeader title="Subject performance" description="Average across published assessments." />
        {profile.subjects.length === 0 ? (
          <div className="p-5 text-sm text-[var(--ink-muted)]">
            No published marks yet for this student.
          </div>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Subject</Th>
                <Th>Average</Th>
                <Th hideBelow="md">Latest</Th>
                <Th hideBelow="md">Assessments</Th>
                <Th hideBelow="lg">Assignments</Th>
                <Th hideBelow="lg">Progress</Th>
              </tr>
            </thead>
            <tbody>
              {profile.subjects.map((subject) => (
                <Tr key={subject.subjectId}>
                  <Td>{subject.subjectName}</Td>
                  <Td>
                    <span className="tabular text-sm font-medium">
                      {subject.averagePercentage != null ? `${subject.averagePercentage}%` : '—'}
                    </span>
                  </Td>
                  <Td hideBelow="md">
                    {subject.latestPercentage != null ? (
                      <span className="inline-flex items-center gap-1 tabular text-sm">
                        {subject.latestPercentage}%
                        {subject.trendDelta != null && (
                          <span
                            className={
                              subject.trendDelta >= 0
                                ? 'text-[var(--ok-soft-ink)]'
                                : 'text-[var(--danger-soft-ink)]'
                            }
                          >
                            ({subject.trendDelta >= 0 ? '+' : ''}
                            {subject.trendDelta})
                          </span>
                        )}
                      </span>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td hideBelow="md">
                    <span className="tabular text-sm text-[var(--ink-muted)]">
                      {subject.assessments}
                    </span>
                  </Td>
                  <Td hideBelow="lg">
                    <span className="text-sm text-[var(--ink-muted)]">
                      {subject.assignmentsSubmitted}/{subject.assignmentsDue}
                      {subject.assignmentsOverdue > 0 && (
                        <span className="ml-1 text-[var(--danger-soft-ink)]">
                          ({subject.assignmentsOverdue} overdue)
                        </span>
                      )}
                    </span>
                  </Td>
                  <Td hideBelow="lg">
                    <Progress
                      value={subject.averagePercentage ?? 0}
                      max={100}
                      tone={toneForPercentage(subject.averagePercentage)}
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card>
        <CardHeader title="Teacher remarks" description="Progress notes shared with your account." />
        {notes.length === 0 ? (
          <div className="p-5 text-sm text-[var(--ink-muted)]">
            No progress notes have been shared yet.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {notes.map((note) => (
              <li key={note.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="brand">{note.category.toLowerCase()}</Badge>
                  <span className="text-xs text-[var(--ink-muted)]">
                    {new Date(note.createdAt).toLocaleDateString(undefined, {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                    {note.author ? ` · ${note.author.name}` : ''}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--ink)]">{note.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** Teachers record progress notes for students in their own classes. */
function TeacherProgress() {
  const context = usePortalContext();
  const [classSectionId, setClassSectionId] = React.useState('');
  const [students, setStudents] = React.useState<
    { id: string; firstName: string; lastName: string; admissionNo: string }[]
  >([]);
  const [studentId, setStudentId] = React.useState('');
  const [notes, setNotes] = React.useState<ProgressNote[]>([]);
  const [body, setBody] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const classOptions = React.useMemo(
    () => context.classes.map((entry) => entry.classSection),
    [context.classes],
  );

  React.useEffect(() => {
    if (!classSectionId && classOptions.length > 0) setClassSectionId(classOptions[0].id);
  }, [classOptions, classSectionId]);

  React.useEffect(() => {
    if (!classSectionId) return;
    let cancelled = false;
    list<{ id: string; firstName: string; lastName: string; admissionNo: string }>(
      '/api/admin/students',
      { classSectionId, pageSize: 200 },
    )
      .then((result) => {
        if (!cancelled) {
          setStudents(result.rows);
          setStudentId(result.rows[0]?.id ?? '');
        }
      })
      .catch(() => {
        if (!cancelled) setStudents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [classSectionId]);

  const loadNotes = React.useCallback(async () => {
    if (!studentId) {
      setNotes([]);
      return;
    }
    try {
      const result = await list<ProgressNote>('/api/admin/progress', {
        scope: 'notes',
        studentId,
        pageSize: 50,
      });
      setNotes(result.rows);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load notes.');
    }
  }, [studentId]);

  React.useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  const save = async () => {
    if (!body.trim() || !studentId) return;
    setSaving(true);
    try {
      await api.post('/api/admin/progress', {
        action: 'note',
        studentId,
        category: 'ACADEMIC',
        visibility: 'STAFF_PARENT',
        body: body.trim(),
      });
      setBody('');
      toast.success('Progress note saved.');
      await loadNotes();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not save the note.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Progress notes"
        description="Record academic observations for students in your classes."
      />

      {error && <Alert tone="danger" title="Something went wrong">{error}</Alert>}

      <Card>
        <CardHeader title="Choose a student" icon={<NotebookPen />} />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <div>
            <label htmlFor="pg-class" className="mb-1.5 block text-xs font-medium text-[var(--ink-muted)]">
              Class
            </label>
            <select
              id="pg-class"
              value={classSectionId}
              onChange={(event) => setClassSectionId(event.target.value)}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm"
            >
              {classOptions.length === 0 && <option value="">No classes assigned</option>}
              {classOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="pg-student" className="mb-1.5 block text-xs font-medium text-[var(--ink-muted)]">
              Student
            </label>
            <select
              id="pg-student"
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm"
            >
              {students.length === 0 && <option value="">No students</option>}
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.firstName} {student.lastName} ({student.admissionNo})
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Add a note" description="Shared with the student's guardians." />
        <div className="space-y-3 p-4 sm:p-5">
          <textarea
            rows={4}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={4000}
            placeholder="Describe the student's progress, strengths, or areas that need attention."
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]"
          />
          <div className="flex justify-end">
            <Button onClick={save} loading={saving} disabled={!body.trim() || !studentId}>
              Save note
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Previous notes" description={`${notes.length} note${notes.length === 1 ? '' : 's'}`} />
        {notes.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<NotebookPen />}
              title="No notes yet"
              description="Notes you add for this student will be listed here."
            />
          </div>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {notes.map((note) => (
              <li key={note.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="brand">{note.category.toLowerCase()}</Badge>
                  <span className="text-xs text-[var(--ink-muted)]">
                    {new Date(note.createdAt).toLocaleDateString(undefined, {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--ink)]">{note.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
