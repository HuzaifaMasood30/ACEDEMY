'use client';

import * as React from 'react';
import {
  CheckCircle2,
  ClipboardList,
  FileSearch,
  RefreshCw,
  UserCheck,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { Alert, Badge, Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Card, EmptyState, PageHeader, StatCard } from '@/components/ui/structure';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Modal } from '@/components/ui/overlays';
import { api } from '@/lib/client-api';
import { useMutation, useResource } from '@/lib/use-resource';
import { formatDate, formatNumber, titleCase } from '@/lib/format';

interface ApplicationRow {
  id: string;
  applicationNo: string;
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string | null;
  guardianRelation: string;
  requestedClass: string | null;
  previousSchool: string | null;
  previousGrade: string | null;
  status: string;
  source: string;
  trialClassRequested: boolean;
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  course: { id: string; name: string } | null;
}

const STATUS_TONE: Record<
  string,
  'neutral' | 'warning' | 'success' | 'danger' | 'info' | 'brand'
> = {
  APPLICANT: 'warning',
  UNDER_REVIEW: 'info',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  WAITLISTED: 'brand',
  WITHDRAWN: 'neutral',
};

const DECISIONS = ['APPLICANT', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'WAITLISTED', 'WITHDRAWN'] as const;

export function AdmissionsClient() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [reviewTarget, setReviewTarget] = React.useState<ApplicationRow | null>(null);
  const [decision, setDecision] = React.useState('UNDER_REVIEW');
  const [notes, setNotes] = React.useState('');

  const { run, pending } = useMutation();

  const resource = useResource<ApplicationRow>('/api/admin/admissions', {
    params: { page, pageSize: 20, q: search, status },
    debounceMs: 250,
  });

  const columns: Column<ApplicationRow>[] = [
    {
      key: 'applicant',
      header: 'Applicant',
      sortable: true,
      cell: (row) => (
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => {
              setReviewTarget(row);
              setDecision(row.status === 'APPLICANT' ? 'UNDER_REVIEW' : (row.status as typeof decision));
              setNotes(row.reviewNotes ?? '');
            }}
            className="block truncate text-left text-sm font-medium text-[var(--ink)] hover:text-[var(--brand)]"
          >
            {row.firstName} {row.lastName}
          </button>
          <span className="tabular block text-[0.6875rem] text-[var(--ink-subtle)]">
            {row.applicationNo} · {titleCase(row.gender)}
          </span>
        </div>
      ),
    },
    {
      key: 'guardian',
      header: 'Guardian',
      hideBelow: 'md',
      cell: (row) => (
        <div className="min-w-0">
          <span className="block truncate text-sm text-[var(--ink)]">{row.guardianName}</span>
          <span className="tabular block truncate text-[0.6875rem] text-[var(--ink-subtle)]">
            {row.guardianPhone}
          </span>
        </div>
      ),
    },
    {
      key: 'requestedClass',
      header: 'Requested',
      hideBelow: 'lg',
      cell: (row) => (
        <div>
          <span className="block text-xs text-[var(--ink)]">
            {row.requestedClass ?? row.course?.name ?? 'Not specified'}
          </span>
          {row.trialClassRequested && (
            <span className="block text-[0.6875rem] text-[var(--brand)]">Trial class requested</span>
          )}
        </div>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      hideBelow: 'lg',
      cell: (row) => (
        <span className="text-xs text-[var(--ink-muted)]">{titleCase(row.source)}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Applied',
      align: 'right',
      hideBelow: 'md',
      cell: (row) => (
        <span className="tabular text-xs text-[var(--ink-muted)]">{formatDate(row.createdAt)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <Badge tone={STATUS_TONE[row.status] ?? 'neutral'}>{titleCase(row.status)}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setReviewTarget(row);
            setDecision(row.status === 'APPLICANT' ? 'UNDER_REVIEW' : (row.status as typeof decision));
            setNotes(row.reviewNotes ?? '');
          }}
        >
          <FileSearch />
          Review
        </Button>
      ),
    },
  ];

  const applicants = resource.rows.filter((r) => r.status === 'APPLICANT').length;
  const approved = resource.rows.filter((r) => r.status === 'ACCEPTED').length;
  const rejected = resource.rows.filter((r) => r.status === 'REJECTED').length;

  const submitReview = async () => {
    if (!reviewTarget) return;
    const result = await run(
      () =>
        api.put('/api/admin/admissions', {
          applicationId: reviewTarget.id,
          decision,
          reviewNotes: notes.trim() || null,
        }),
      { success: 'Application updated.' },
    );
    if (result) {
      setReviewTarget(null);
      resource.reload();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admissions"
        description="Online and walk-in applications, from first enquiry through to enrolment."
        breadcrumbs={[{ label: 'People' }, { label: 'Admissions' }]}
        actions={
          <Button variant="outline" onClick={resource.reload} loading={resource.refreshing}>
            <RefreshCw />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Applications"
          value={formatNumber(resource.meta?.total ?? 0)}
          icon={<ClipboardList />}
          tone="brand"
        />
        <StatCard
          label="Awaiting review"
          value={formatNumber(applicants)}
          icon={<UserPlus />}
          tone={applicants > 0 ? 'warning' : 'success'}
          hint="On this page"
        />
        <StatCard label="Accepted" value={formatNumber(approved)} icon={<UserCheck />} tone="success" />
        <StatCard label="Rejected" value={formatNumber(rejected)} icon={<XCircle />} tone="danger" />
      </div>

      {resource.error && (
        <Alert tone="danger" title="Could not load applications">
          {resource.error}
        </Alert>
      )}

      <DataTable<ApplicationRow>
        columns={columns}
        rows={resource.rows}
        rowKey={(row) => row.id}
        loading={resource.loading}
        searchable
        searchPlaceholder="Search by name, application number or guardian…"
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: [
              { value: 'APPLICANT', label: 'Applicant' },
              { value: 'UNDER_REVIEW', label: 'Under review' },
              { value: 'ACCEPTED', label: 'Accepted' },
              { value: 'WAITLISTED', label: 'Waitlisted' },
              { value: 'REJECTED', label: 'Rejected' },
              { value: 'WITHDRAWN', label: 'Withdrawn' },
            ],
          },
        ]}
        filterValues={{ status }}
        onFilterChange={(key, value) => {
          if (key === 'status') setStatus(value);
          setPage(1);
        }}
        pagination={
          resource.meta
            ? {
                page: resource.meta.page,
                pageSize: resource.meta.pageSize,
                total: resource.meta.total,
                totalPages: resource.meta.totalPages,
              }
            : undefined
        }
        onPageChange={setPage}
        emptyTitle="No applications"
        emptyDescription="Applications submitted from the public admissions page appear here for review."
      />

      <Modal
        open={Boolean(reviewTarget)}
        onClose={() => setReviewTarget(null)}
        title={reviewTarget ? `${reviewTarget.firstName} ${reviewTarget.lastName}` : 'Application'}
        description={reviewTarget ? reviewTarget.applicationNo : undefined}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setReviewTarget(null)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submitReview} loading={pending}>
              Save decision
            </Button>
          </>
        }
      >
        {reviewTarget && (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {[
                ['Gender', titleCase(reviewTarget.gender)],
                ['Date of birth', formatDate(reviewTarget.dateOfBirth)],
                ['Applied', formatDate(reviewTarget.createdAt)],
                ['Guardian', reviewTarget.guardianName],
                ['Relation', titleCase(reviewTarget.guardianRelation)],
                ['Phone', reviewTarget.guardianPhone],
                ['Email', reviewTarget.guardianEmail ?? '—'],
                ['Requested class', reviewTarget.requestedClass ?? '—'],
                ['Previous school', reviewTarget.previousSchool ?? '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-[var(--ink-subtle)]">{label}</dt>
                  <dd className="mt-0.5 truncate text-sm font-medium text-[var(--ink)]">{value}</dd>
                </div>
              ))}
            </dl>

            {reviewTarget.previousGrade && (
              <p className="text-xs text-[var(--ink-muted)]">
                Previous grade: {reviewTarget.previousGrade}
              </p>
            )}

            {reviewTarget.trialClassRequested && (
              <Alert tone="info" title="Trial class requested">
                This applicant asked to attend a trial class before deciding. Confirm a slot with the
                guardian.
              </Alert>
            )}

            <Field label="Decision" htmlFor="review-decision" required>
              <Select
                id="review-decision"
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
              >
                {DECISIONS.map((value) => (
                  <option key={value} value={value}>
                    {titleCase(value)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Review notes"
              htmlFor="review-notes"
              hint="Internal only. Visible to administrators, not to the guardian."
            >
              <Textarea
                id="review-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>

            {decision === 'ACCEPTED' && (
              <Alert tone="info" title="After approval">
                Create the student record from the Students screen to generate an admission number and
                portal login. Accepting here does not enrol the applicant.
              </Alert>
            )}
          </div>
        )}
      </Modal>

      {resource.rows.length === 0 && !resource.loading && (
        <EmptyState
          icon={<CheckCircle2 />}
          title="No applications yet"
          description="Share the public admissions link so guardians can apply online."
          className="border-0"
        />
      )}
    </div>
  );
}
