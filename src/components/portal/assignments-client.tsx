'use client';

import * as React from 'react';
import { ClipboardList, Clock, Plus, Send, Upload } from 'lucide-react';
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
import { Alert, Badge, Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/overlays';
import { ChildSelector, usePortalContext } from './portal-context';
import { api, list } from '@/lib/client-api';

interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  status: string;
  marksObtained: number | string | null;
  isLate: boolean;
  submittedAt: string | null;
  gradedAt: string | null;
  feedback: string | null;
  content: string | null;
  student?: { firstName: string; lastName: string; admissionNo: string };
}

interface AssignmentRow {
  id: string;
  title: string;
  description: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  dueAt: string;
  maxMarks: number;
  allowLateSubmission: boolean;
  classSection: { id: string; name: string };
  subject: { id: string; name: string };
  teacherProfile: { user: { name: string } };
  submissionCount: number;
  mySubmissions: Submission[];
}

const STATUS_TONE: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'brand'> = {
  DRAFT: 'info',
  PUBLISHED: 'brand',
  CLOSED: 'warning',
  NOT_SUBMITTED: 'warning',
  SUBMITTED: 'brand',
  LATE: 'warning',
  GRADED: 'success',
  RETURNED: 'info',
};

/** Assignments list; teachers also get a create form and grading controls. */
export function AssignmentsClient() {
  const context = usePortalContext();
  const isTeacher = context.scope === 'teacher';
  const isStudent = context.scope === 'student';

  const [rows, setRows] = React.useState<AssignmentRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [classFilter, setClassFilter] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [submitting, setSubmitting] = React.useState<AssignmentRow | null>(null);
  const [grading, setGrading] = React.useState<{ assignment: AssignmentRow; submission: Submission } | null>(
    null,
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await list<AssignmentRow>('/api/assignments', {
        classSectionId: classFilter || undefined,
        studentId: context.scope === 'parent' ? context.student?.id : undefined,
        pageSize: 50,
      });
      setRows(result.rows);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load assignments.');
    } finally {
      setLoading(false);
    }
  }, [classFilter, context.scope, context.student?.id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const classOptions = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const entry of context.classes) seen.set(entry.classSection.id, entry.classSection.name);
    for (const student of context.students) {
      for (const enrollment of student.enrollments) {
        seen.set(enrollment.classSection.id, enrollment.classSection.name);
      }
    }
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [context.classes, context.students]);

  const now = Date.now();
  const upcoming = rows.filter(
    (row) => row.status === 'PUBLISHED' && new Date(row.dueAt).getTime() > now,
  ).length;
  const overdue = rows.filter(
    (row) =>
      row.status === 'PUBLISHED' &&
      new Date(row.dueAt).getTime() < now &&
      row.mySubmissions.length === 0,
  ).length;
  const graded = rows.filter((row) =>
    row.mySubmissions.some((submission) => submission.status === 'GRADED'),
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assignments"
        description={
          isTeacher
            ? 'Homework and coursework for the classes you teach.'
            : context.student
              ? `Assignments for ${context.student.firstName} ${context.student.lastName}.`
              : 'Homework and coursework.'
        }
        actions={
          <div className="flex items-center gap-2">
            <ChildSelector context={context} />
            {isTeacher && (
              <Button onClick={() => setCreating(true)}>
                <Plus />
                New assignment
              </Button>
            )}
          </div>
        }
      />

      {error && <Alert tone="danger" title="Could not load assignments">{error}</Alert>}

      {!isTeacher && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Upcoming" value={upcoming} icon={<Clock />} />
          <StatCard
            label="Awaiting submission"
            value={overdue}
            tone={overdue > 0 ? 'danger' : undefined}
          />
          <StatCard label="Graded" value={graded} tone="success" />
        </div>
      )}

      <Card>
        <CardHeader
          title="All assignments"
          description={`${rows.length} assignment${rows.length === 1 ? '' : 's'}`}
          action={
            classOptions.length > 1 ? (
              <select
                value={classFilter}
                onChange={(event) => setClassFilter(event.target.value)}
                aria-label="Filter by class"
                className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--ink)]"
              >
                <option value="">All classes</option>
                {classOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            ) : undefined
          }
        />
        {loading ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="skeleton h-14 rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<ClipboardList />}
              title="No assignments yet"
              description={
                isTeacher
                  ? 'Create an assignment to share it with your class.'
                  : 'New homework will appear here as soon as a teacher publishes it.'
              }
            />
          </div>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Assignment</Th>
                <Th hideBelow="md">Subject</Th>
                <Th>Due</Th>
                <Th>Status</Th>
                <Th hideBelow="lg">{isTeacher ? 'Submissions' : 'Marks'}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const mine = row.mySubmissions[0];
                const isOverdue =
                  row.status === 'PUBLISHED' && new Date(row.dueAt).getTime() < now && !mine;
                return (
                  <Tr key={row.id}>
                    <Td>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--ink)]">{row.title}</p>
                        <p className="truncate text-xs text-[var(--ink-muted)]">
                          {row.classSection.name} · {row.teacherProfile.user.name}
                        </p>
                      </div>
                    </Td>
                    <Td hideBelow="md">{row.subject.name}</Td>
                    <Td>
                      <span className="tabular text-sm">
                        {new Date(row.dueAt).toLocaleDateString(undefined, {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={STATUS_TONE[row.status]}>{row.status.toLowerCase()}</Badge>
                        {isOverdue && <Badge tone="danger">overdue</Badge>}
                        {mine && (
                          <Badge tone={STATUS_TONE[mine.status] ?? 'brand'}>
                            {mine.status.replace('_', ' ').toLowerCase()}
                          </Badge>
                        )}
                      </div>
                    </Td>
                    <Td hideBelow="lg">
                      {isTeacher ? (
                        <span className="tabular text-sm">{row.submissionCount}</span>
                      ) : mine?.marksObtained != null ? (
                        <span className="tabular text-sm font-medium">
                          {Number(mine.marksObtained)}/{row.maxMarks}
                        </span>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        {isTeacher && row.status === 'DRAFT' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              try {
                                await api.patch('/api/assignments', {
                                  action: 'status',
                                  assignmentId: row.id,
                                  status: 'PUBLISHED',
                                });
                                toast.success('Assignment published and parents notified.');
                                await load();
                              } catch (caught) {
                                toast.error(
                                  caught instanceof Error ? caught.message : 'Could not publish.',
                                );
                              }
                            }}
                          >
                            <Send />
                            Publish
                          </Button>
                        )}
                        {isStudent && row.status === 'PUBLISHED' && (
                          <Button size="sm" variant="outline" onClick={() => setSubmitting(row)}>
                            <Upload />
                            {mine ? 'Resubmit' : 'Submit'}
                          </Button>
                        )}
                        {isTeacher && row.submissionCount > 0 && (
                          <Button size="sm" variant="ghost" onClick={() => setGrading({ assignment: row, submission: row.mySubmissions[0] })}>
                            Review
                          </Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      {isTeacher && creating && (
        <CreateAssignmentModal
          classes={context.classes}
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await load();
          }}
        />
      )}

      {isStudent && submitting && (
        <SubmitModal
          assignment={submitting}
          existing={submitting.mySubmissions[0]}
          onClose={() => setSubmitting(null)}
          onDone={async () => {
            setSubmitting(null);
            await load();
          }}
        />
      )}

      {isTeacher && grading && (
        <GradeModal
          assignment={grading.assignment}
          submission={grading.submission}
          onClose={() => setGrading(null)}
          onDone={async () => {
            setGrading(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function CreateAssignmentModal({
  classes,
  onClose,
  onCreated,
}: {
  classes: { classSection: { id: string; name: string }; subjects: { id: string; name: string }[] }[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [classSectionId, setClassSectionId] = React.useState(classes[0]?.classSection.id ?? '');
  const [subjectId, setSubjectId] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [dueAt, setDueAt] = React.useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date.toISOString().slice(0, 10);
  });
  const [maxMarks, setMaxMarks] = React.useState('100');
  const [allowLate, setAllowLate] = React.useState(true);
  const [publish, setPublish] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const subjects = React.useMemo(
    () => classes.find((entry) => entry.classSection.id === classSectionId)?.subjects ?? [],
    [classes, classSectionId],
  );

  React.useEffect(() => {
    if (subjects.length > 0 && !subjects.some((subject) => subject.id === subjectId)) {
      setSubjectId(subjects[0].id);
    }
  }, [subjects, subjectId]);

  const save = async () => {
    if (!title.trim()) {
      setError('Give the assignment a title.');
      return;
    }
    if (!subjectId) {
      setError('Choose the subject this assignment belongs to.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/api/assignments', {
        title: title.trim(),
        description: description.trim() || null,
        classSectionId,
        subjectId,
        dueAt: new Date(`${dueAt}T23:59:00.000Z`).toISOString(),
        maxMarks: Number(maxMarks),
        allowLateSubmission: allowLate,
        publish,
      });
      toast.success(publish ? 'Assignment published and parents notified.' : 'Draft saved.');
      await onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the assignment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="New assignment">
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Title" htmlFor="as-title">
          <Input id="as-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Class" htmlFor="as-class">
            <Select id="as-class" value={classSectionId} onChange={(e) => setClassSectionId(e.target.value)}>
              {classes.map((entry) => (
                <option key={entry.classSection.id} value={entry.classSection.id}>
                  {entry.classSection.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Subject" htmlFor="as-subject">
            <Select id="as-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {subjects.length === 0 && <option value="">No subjects assigned</option>}
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Instructions" htmlFor="as-desc">
          <Textarea
            id="as-desc"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={4000}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Due date" htmlFor="as-due">
            <Input id="as-due" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </Field>
          <Field label="Maximum marks" htmlFor="as-marks">
            <Input
              id="as-marks"
              type="number"
              min={1}
              max={1000}
              value={maxMarks}
              onChange={(e) => setMaxMarks(e.target.value)}
            />
          </Field>
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
            <input type="checkbox" checked={allowLate} onChange={(e) => setAllowLate(e.target.checked)} />
            Accept late submissions
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            Publish immediately and notify parents
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            {publish ? 'Publish' : 'Save draft'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SubmitModal({
  assignment,
  existing,
  onClose,
  onDone,
}: {
  assignment: AssignmentRow;
  existing?: Submission;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [content, setContent] = React.useState(existing?.content ?? '');
  const [fileUrl, setFileUrl] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isLate = new Date(assignment.dueAt).getTime() < Date.now();

  const submit = async () => {
    if (!content.trim() && !fileUrl.trim()) {
      setError('Add your answer or a link to your work before submitting.');
      return;
    }

    setSaving(true);
    try {
      await api.patch('/api/assignments', {
        action: 'submit',
        assignmentId: assignment.id,
        content: content.trim() || null,
        fileUrl: fileUrl.trim() || null,
      });
      toast.success(isLate ? 'Submitted late — your teacher will see it was late.' : 'Submitted.');
      await onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not submit.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Submit — ${assignment.title}`}>
      <div className="space-y-4">
        {isLate && (
          <Alert tone="warning" title="Past the deadline">
            {assignment.allowLateSubmission
              ? 'Your submission will be marked as late.'
              : 'This assignment no longer accepts submissions.'}
          </Alert>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Your answer" htmlFor="sb-content">
          <Textarea
            id="sb-content"
            rows={6}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={8000}
          />
        </Field>
        <Field label="Link to your work (optional)" htmlFor="sb-file" hint="A URL your teacher can open.">
          <Input
            id="sb-file"
            value={fileUrl}
            onChange={(e) => setFileUrl(e.target.value)}
            placeholder="https://"
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            loading={saving}
            disabled={isLate && !assignment.allowLateSubmission}
          >
            Submit
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function GradeModal({
  assignment,
  submission,
  onClose,
  onDone,
}: {
  assignment: AssignmentRow;
  submission: Submission;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [marks, setMarks] = React.useState(
    submission.marksObtained != null ? String(Number(submission.marksObtained)) : '',
  );
  const [feedback, setFeedback] = React.useState(submission.feedback ?? '');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch('/api/assignments', {
        action: 'grade',
        submissionId: submission.id,
        marksObtained: marks === '' ? null : Number(marks),
        feedback: feedback.trim() || null,
      });
      toast.success('Grade saved.');
      await onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the grade.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Review — ${assignment.title}`}>
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        {submission.content && (
          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-3">
            <p className="whitespace-pre-wrap text-sm text-[var(--ink)]">{submission.content}</p>
          </div>
        )}
        <Field label={`Marks (out of ${assignment.maxMarks})`} htmlFor="gr-marks">
          <Input
            id="gr-marks"
            type="number"
            min={0}
            max={assignment.maxMarks}
            value={marks}
            onChange={(e) => setMarks(e.target.value)}
          />
        </Field>
        <Field label="Feedback" htmlFor="gr-feedback">
          <Textarea
            id="gr-feedback"
            rows={4}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            maxLength={4000}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={save} loading={saving}>
            Save grade
          </Button>
        </div>
      </div>
    </Modal>
  );
}
