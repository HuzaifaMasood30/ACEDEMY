'use client';

import * as React from 'react';
import { Users } from 'lucide-react';
import { api } from '@/lib/client-api';
import { useObjectResource } from '@/lib/use-resource';

export interface PortalStudentLink {
  relation: string;
  isPrimary: boolean;
  canViewFees: boolean;
  canViewResults: boolean;
  receivesNotifications: boolean;
}

export interface PortalStudent {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  status: string;
  photoUrl: string | null;
  dateOfBirth: string | null;
  enrollments: { classSection: { id: string; name: string; course: { id: string; name: string } } }[];
  link?: PortalStudentLink;
}

export interface PortalClassLink {
  classSection: {
    id: string;
    name: string;
    capacity: number;
    course: { id: string; name: string };
    _count: { enrollments: number };
  };
  /** Subjects this teacher covers in the class. Empty for a student's class. */
  subjects: { id: string; name: string; code?: string }[];
}

interface PortalContextPayload {
  scope: 'student' | 'parent' | 'teacher' | 'admin';
  studentId: string | null;
  students?: PortalStudent[];
  classes?: PortalClassLink[];
}

export interface PortalContextState {
  loading: boolean;
  error: string | null;
  scope: PortalContextPayload['scope'] | null;
  students: PortalStudent[];
  classes: PortalClassLink[];
  /** The student currently in focus, honouring the selected child for a guardian. */
  student: PortalStudent | null;
  /** Guardians choose which child the page is about; students have only one. */
  selectStudent: (id: string) => void;
  /** True when the guardian may see fee data for the focused child. */
  canViewFees: boolean;
  canViewResults: boolean;
  reload: () => void;
}

const SELECTED_KEY = 'portal:selectedStudent';

/**
 * Resolve the acting student or children for the current portal page.
 *
 * A guardian with several children gets a selector; the choice is remembered in
 * session storage so moving between pages keeps the same child in focus.
 */
export function usePortalContext(): PortalContextState {
  const { data, loading, error, reload } = useObjectResource<PortalContextPayload>('/api/portal');

  const [selected, setSelected] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    setSelected(window.sessionStorage.getItem(SELECTED_KEY));
  }, []);

  // `data?.students ?? []` would mint a new array on every render, so the memo
  // below would recompute each time and hand consumers a new reference.
  const students = React.useMemo(() => data?.students ?? [], [data?.students]);

  const student = React.useMemo(() => {
    if (students.length === 0) return null;
    if (selected) {
      const match = students.find((candidate) => candidate.id === selected);
      if (match) return match;
    }
    return students[0];
  }, [students, selected]);

  const selectStudent = React.useCallback((id: string) => {
    setSelected(id);
    if (typeof window !== 'undefined') window.sessionStorage.setItem(SELECTED_KEY, id);
  }, []);

  return {
    loading,
    error,
    scope: data?.scope ?? null,
    students,
    classes: data?.classes ?? [],
    student,
    selectStudent,
    canViewFees: student?.link?.canViewFees ?? data?.scope !== 'parent',
    canViewResults: student?.link?.canViewResults ?? data?.scope !== 'parent',
    reload,
  };
}

/** A guardian-facing selector shown only when more than one child is linked. */
export function ChildSelector({
  context,
}: {
  context: PortalContextState;
}) {
  if (context.scope !== 'parent' || context.students.length <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <Users className="h-4 w-4 text-[var(--ink-muted)]" aria-hidden />
      <label htmlFor="child-selector" className="text-xs font-medium text-[var(--ink-muted)]">
        Viewing
      </label>
      <select
        id="child-selector"
        value={context.student?.id ?? ''}
        onChange={(event) => context.selectStudent(event.target.value)}
        className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
      >
        {context.students.map((child) => (
          <option key={child.id} value={child.id}>
            {child.firstName} {child.lastName}
            {child.enrollments[0] ? ` — ${child.enrollments[0].classSection.name}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Human-readable name for a student record. */
export function studentName(student: PortalStudent | null): string {
  return student ? `${student.firstName} ${student.lastName}` : 'the student';
}
