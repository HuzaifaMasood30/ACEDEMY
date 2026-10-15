'use client';

import * as React from 'react';
import { ClipboardList, Save, Send } from 'lucide-react';
import { toast } from 'sonner';
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
import { Alert, Badge, Button, Field, Input, Select } from '@/components/ui/primitives';
import { api } from '@/lib/client-api';

interface ExamSubjectOption {
  id: string;
  maxMarks: number;
  passMarks: number;
  subject: { id: string; name: string; code: string };
  classSection: { id: string; name: string };
  exam: { id: string; name: string; examType: string; resultStatus: string };
  _count: { results: number };
}

interface MarksheetRow {
  student: { id: string; admissionNo: string; firstName: string; lastName: string; rollNo: string | null };
  result: {
    status: string;
    marksObtained: number | null;
    theoryMarks: number | null;
    practicalMarks: number | null;
    percentage: number | null;
    grade: string | null;
    remarks: string | null;
  } | null;
}

type MarkStatus = 'SCORED' | 'ABSENT' | 'EXEMPT' | 'WITHHELD';

interface DraftEntry {
  status: MarkStatus;
  marks: string;
  remarks: string;
}

const RESULT_STATUS_TONE: Record<string, 'success' | 'warning' | 'info' | 'brand'> = {
  PUBLISHED: 'success',
  APPROVED: 'info',
  SUBMITTED: 'info',
  DRAFT: 'brand',
  WITHHELD: 'warning',
};

/**
 * Marks entry for a teacher's own exam subjects.
 *
 * Drafts can be saved repeatedly; submitting hands the sheet to the
 * administrator, who alone may approve and publish it. The publish workflow is
 * deliberately absent here.
 */
export function MarksClient() {
  const [options, setOptions] = React.useState<ExamSubjectOption[]>([]);
  const [selectedId, setSelectedId] = React.useState('');
  const [rows, setRows] = React.useState<MarksheetRow[]>([]);
  const [draft, setDraft] = React.useState<Record<string, DraftEntry>>({});
  const [loadingOptions, setLoadingOptions] = React.useState(true);
  const [loadingSheet, setLoadingSheet] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    api
      .getOne<ExamSubjectOption[]>('/api/admin/exams', { scope: 'myExamSubjects', pageSize: 200 })
      .then((list) => {
        if (cancelled) return;
        setOptions(list);
        setSelectedId((current) => current || list[0]?.id || '');
      })
      .catch((caught: Error) => {
        if (!cancelled) setError(caught.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = options.find((option) => option.id === selectedId) ?? null;
  const published = selected?.exam.resultStatus === 'PUBLISHED';

  React.useEffect(() => {
    if (!selectedId) {
      setRows([]);
      setDraft({});
      return;
    }

    let cancelled = false;
    setLoadingSheet(true);

    api
      .getOne<{ rows: MarksheetRow[] }>('/api/admin/exams', {
        scope: 'marksheet',
        examSubjectId: selectedId,
      })
      .then((payload) => {
        if (cancelled) return;
        setRows(payload.rows);

        const next: Record<string, DraftEntry> = {};
        for (const row of payload.rows) {
          next[row.student.id] = {
            status: (row.result?.status as MarkStatus) ?? 'SCORED',
            marks:
              row.result?.marksObtained != null ? String(row.result.marksObtained) : '',
            remarks: row.result?.remarks ?? '',
          };
        }
        setDraft(next);
        setError(null);
      })
      .catch((caught: Error) => {
        if (!cancelled) setError(caught.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingSheet(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const update = (studentId: string, patch: Partial<DraftEntry>) => {
    setDraft((current) => ({
      ...current,
      [studentId]: { ...current[studentId], ...patch },
    }));
  };

  const save = async (submit: boolean) => {
    if (!selected) return;

    const marks = Object.entries(draft).map(([studentId, entry]) => {
      const scored = entry.status === 'SCORED';
      const value = entry.marks.trim() === '' ? null : Number(entry.marks);

      if (scored && value == null) {
        throw new Error('Enter a mark for every student, or set their status to Absent.');
      }
      if (scored && (Number.isNaN(value) || value! < 0 || value! > selected.maxMarks)) {
        throw new Error(`Marks must be between 0 and ${selected.maxMarks}.`);
      }

      return {
        studentId,
        status: entry.status,
        marksObtained: scored ? value : null,
        remarks: entry.remarks.trim() || null,
      };
    });

    setSaving(true);
    try {
      const result = await api.post<{ saved?: number; submitted?: boolean }>(
        '/api/admin/exams',
        { examSubjectId: selected.id, submit, marks },
      );
      toast.success(
        submit
          ? 'Marks submitted to the administrator for approval.'
          : `Draft saved for ${result?.saved ?? marks.length} student(s).`,
      );
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not save the marksheet.');
    } finally {
      setSaving(false);
    }
  };

  const enteredCount = Object.values(draft).filter(
    (entry) => entry.status !== 'SCORED' || entry.marks.trim() !== '',
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marks entry"
        description="Enter marks for your subjects and submit them for approval."
      />

      {error && <Alert tone="danger" title="Could not load the marksheet">{error}</Alert>}

      {loadingOptions ? (
        <div className="skeleton h-24 rounded-xl" />
      ) : options.length === 0 ? (
        <Card>
          <div className="p-5">
            <EmptyState
              icon={<ClipboardList />}
              title="Nothing to grade"
              description="You have no exam subjects assigned. Ask an administrator to schedule an examination for your classes."
            />
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader title="Choose a marksheet" icon={<ClipboardList />} />
            <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
              <Field label="Examination subject" htmlFor="mk-subject">
                <Select
                  id="mk-subject"
                  value={selectedId}
                  onChange={(event) => setSelectedId(event.target.value)}
                >
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.exam.name} · {option.classSection.name} · {option.subject.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {selected && (
                <div className="flex flex-wrap items-end gap-3">
                  <Badge tone="neutral">max {selected.maxMarks}</Badge>
                  <Badge tone="neutral">pass {selected.passMarks}</Badge>
                  <Badge tone={RESULT_STATUS_TONE[selected.exam.resultStatus] ?? 'brand'}>
                    {selected.exam.resultStatus.toLowerCase()}
                  </Badge>
                </div>
              )}
            </div>
          </Card>

          {published && (
            <Alert tone="warning" title="These results are published">
              The examination has been published, so marks can no longer be changed from here. Ask an
              administrator to reopen the marksheet if a correction is needed.
            </Alert>
          )}

          <Card>
            <CardHeader
              title={selected ? `${selected.subject.name} — ${selected.classSection.name}` : 'Marksheet'}
              description={`${enteredCount} of ${rows.length} entered`}
              icon={<ClipboardList />}
              action={
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => void save(false)}
                    loading={saving}
                    disabled={published || rows.length === 0}
                  >
                    <Save />
                    Save draft
                  </Button>
                  <Button
                    onClick={() => void save(true)}
                    loading={saving}
                    disabled={published || rows.length === 0}
                  >
                    <Send />
                    Submit for approval
                  </Button>
                </div>
              }
            />
            {loadingSheet ? (
              <div className="space-y-2 p-5">
                {[0, 1, 2, 3, 4].map((index) => (
                  <div key={index} className="skeleton h-12 rounded-lg" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<ClipboardList />}
                  title="No students enrolled"
                  description="This class has no active enrolments, so there is nothing to mark."
                />
              </div>
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Roll</Th>
                    <Th>Student</Th>
                    <Th>Status</Th>
                    <Th>Marks</Th>
                    <Th hideBelow="md">Grade</Th>
                    <Th hideBelow="lg">Remarks</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const entry = draft[row.student.id] ?? {
                      status: 'SCORED' as MarkStatus,
                      marks: '',
                      remarks: '',
                    };
                    const scored = entry.status === 'SCORED';
                    const value = entry.marks.trim() === '' ? null : Number(entry.marks);
                    const outOfRange =
                      scored && value != null && (Number.isNaN(value) || value < 0 || value > (selected?.maxMarks ?? 100));

                    return (
                      <Tr key={row.student.id}>
                        <Td>
                          <span className="tabular text-sm text-[var(--ink-muted)]">
                            {row.student.rollNo ?? '—'}
                          </span>
                        </Td>
                        <Td>
                          <span className="text-sm font-medium text-[var(--ink)]">
                            {row.student.firstName} {row.student.lastName}
                          </span>
                          <span className="ml-2 text-xs text-[var(--ink-subtle)]">
                            {row.student.admissionNo}
                          </span>
                        </Td>
                        <Td>
                          <select
                            value={entry.status}
                            disabled={published}
                            onChange={(event) =>
                              update(row.student.id, { status: event.target.value as MarkStatus })
                            }
                            className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--ink)] disabled:opacity-60"
                            aria-label={`Status for ${row.student.firstName} ${row.student.lastName}`}
                          >
                            <option value="SCORED">Scored</option>
                            <option value="ABSENT">Absent</option>
                            <option value="EXEMPT">Exempt</option>
                            <option value="WITHHELD">Withheld</option>
                          </select>
                        </Td>
                        <Td>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={selected?.maxMarks ?? 100}
                            value={entry.marks}
                            disabled={!scored || published}
                            onChange={(event) =>
                              update(row.student.id, { marks: event.target.value })
                            }
                            className={`tabular w-20 rounded-md border px-2 py-1 text-sm disabled:opacity-60 ${
                              outOfRange
                                ? 'border-[var(--danger)] text-[var(--danger-soft-ink)]'
                                : 'border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]'
                            }`}
                            aria-label={`Marks for ${row.student.firstName} ${row.student.lastName}`}
                          />
                        </Td>
                        <Td hideBelow="md">
                          {row.result?.grade ? (
                            <Badge tone="brand">{row.result.grade}</Badge>
                          ) : (
                            <span className="text-xs text-[var(--ink-subtle)]">—</span>
                          )}
                        </Td>
                        <Td hideBelow="lg">
                          <input
                            type="text"
                            value={entry.remarks}
                            disabled={published}
                            maxLength={300}
                            onChange={(event) =>
                              update(row.student.id, { remarks: event.target.value })
                            }
                            placeholder="Optional"
                            className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--ink)] disabled:opacity-60"
                            aria-label={`Remarks for ${row.student.firstName} ${row.student.lastName}`}
                          />
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
