'use client';

import * as React from 'react';
import { ClipboardCheck, ClipboardList, GraduationCap, TrendingUp } from 'lucide-react';
import {
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
} from '@/components/ui/structure';
import { Badge } from '@/components/ui/primitives';
import { usePortalContext, type PortalStudent } from '@/components/portal/portal-context';
import { api } from '@/lib/client-api';

interface AttendanceSummary {
  percentage: number;
  present: number;
  total: number;
  rules?: { minimumPercentage: number };
}

/** Parent landing page: a summary card per linked child. */
export function ParentDashboardClient() {
  const context = usePortalContext();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parent dashboard"
        description="Your children's attendance, results and fees."
      />

      {context.loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((index) => (
            <div key={index} className="skeleton h-48 rounded-xl" />
          ))}
        </div>
      ) : context.students.length === 0 ? (
        <Card>
          <div className="p-5">
            <EmptyState
              icon={<GraduationCap />}
              title="No children linked"
              description="No student records are linked to this account yet. Contact the academy office."
            />
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {context.students.map((child) => (
            <ChildCard key={child.id} child={child} />
          ))}
        </div>
      )}

      <Card>
        <CardHeader title="Quick links" description="Jump to a section." icon={<TrendingUp />} />
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
          {[
            { href: '/parent/attendance', label: 'Attendance', icon: ClipboardCheck },
            { href: '/parent/results', label: 'Results', icon: TrendingUp },
            { href: '/parent/fees', label: 'Fees', icon: ClipboardList },
            { href: '/parent/assignments', label: 'Assignments', icon: ClipboardList },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-sm font-medium text-[var(--ink)] transition-colors hover:border-[var(--brand)] hover:bg-[var(--surface-hover)]"
            >
              <link.icon className="h-4 w-4 text-[var(--brand-soft-ink)]" aria-hidden />
              {link.label}
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ChildCard({ child }: { child: PortalStudent }) {
  const [attendance, setAttendance] = React.useState<AttendanceSummary | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    api
      .getOne<{ summary: AttendanceSummary }>('/api/admin/attendance', {
        studentId: child.id,
        pageSize: 1,
      })
      .then((result) => {
        if (!cancelled) setAttendance(result.summary);
      })
      .catch(() => {
        // A child's panel stays blank rather than showing a broken figure.
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [child.id]);

  const belowThreshold =
    attendance?.rules != null && attendance.percentage < attendance.rules.minimumPercentage;

  return (
    <Card>
      <CardHeader
        title={`${child.firstName} ${child.lastName}`}
        description={
          child.enrollments[0]
            ? `${child.enrollments[0].classSection.name} · ${child.enrollments[0].classSection.course.name}`
            : 'No active enrolment'
        }
        icon={<GraduationCap />}
        action={child.link?.isPrimary ? <Badge tone="brand">primary guardian</Badge> : undefined}
      />
      <div className="grid grid-cols-2 gap-4 p-4 sm:p-5">
        <div>
          <p className="text-xs text-[var(--ink-muted)]">Admission number</p>
          <p className="tabular text-sm font-medium text-[var(--ink)]">{child.admissionNo}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--ink-muted)]">Attendance</p>
          <p
            className={`tabular text-sm font-medium ${
              belowThreshold ? 'text-[var(--danger-soft-ink)]' : 'text-[var(--ink)]'
            }`}
          >
            {attendance ? `${attendance.percentage}%` : failed ? 'Not available' : '…'}
          </p>
          {attendance && (
            <p className="text-xs text-[var(--ink-subtle)]">
              {attendance.present} of {attendance.total} sessions
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-[var(--line)] p-4">
        <a
          href="/parent/attendance"
          className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--brand-soft-ink)] hover:bg-[var(--surface-hover)]"
        >
          Attendance
        </a>
        {child.link?.canViewResults !== false && (
          <a
            href="/parent/results"
            className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--brand-soft-ink)] hover:bg-[var(--surface-hover)]"
          >
            Results
          </a>
        )}
        {child.link?.canViewFees !== false && (
          <a
            href="/parent/fees"
            className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--brand-soft-ink)] hover:bg-[var(--surface-hover)]"
          >
            Fees
          </a>
        )}
      </div>
    </Card>
  );
}
