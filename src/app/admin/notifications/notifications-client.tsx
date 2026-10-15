'use client';

import * as React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  MessageCircle,
  RefreshCw,
  RotateCcw,
  Send,
  ServerCog,
  Users,
} from 'lucide-react';
import { Alert, Badge, Button, Checkbox, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Card, CardHeader, EmptyState, PageHeader, StatCard } from '@/components/ui/structure';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Modal } from '@/components/ui/overlays';
import { api } from '@/lib/client-api';
import { useMutation, useResource } from '@/lib/use-resource';
import { formatDateTime, formatNumber, titleCase } from '@/lib/format';

interface JobRow {
  id: string;
  category: string;
  channel: string;
  status: string;
  recipientPhone: string;
  templateKey: string;
  attempts: number;
  maxAttempts: number;
  errorMessage: string | null;
  scheduledFor: string;
  sentAt: string | null;
  createdAt: string;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    admissionNo: string;
  } | null;
}

interface StatusPayload {
  whatsapp: {
    mode: 'cloud' | 'mock';
    configuredMode: string;
    live: boolean;
    hasPhoneNumberId: boolean;
    hasAccessToken: boolean;
    hasAppSecret: boolean;
    hasWebhookToken: boolean;
    graphVersion: string;
    defaultLocale: string;
    quietHours: { start: string; end: string };
    rateLimitPerMinute: number;
  };
  queue: {
    queued: number;
    processing: number;
    sent: number;
    delivered: number;
    failed: number;
    last24hTotal: number;
    last24hSimulated: number;
  };
  academy: { name: string };
}

const STATUS_TONE: Record<string, 'neutral' | 'warning' | 'success' | 'danger' | 'info'> = {
  QUEUED: 'info',
  PROCESSING: 'warning',
  SENT: 'success',
  DELIVERED: 'success',
  READ: 'success',
  FAILED: 'danger',
  CANCELLED: 'neutral',
  SKIPPED: 'neutral',
};

const CATEGORIES = [
  'ABSENCE_ALERT',
  'FEE_REMINDER',
  'FEE_OVERDUE',
  'EXAM_REMINDER',
  'RESULT_PUBLISHED',
  'TIMETABLE_CHANGE',
  'ASSIGNMENT_NEW',
  'ANNOUNCEMENT',
  'ADMISSION_UPDATE',
  'GENERAL',
] as const;

export function NotificationsClient() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [sendOpen, setSendOpen] = React.useState(false);
  const [statusData, setStatusData] = React.useState<StatusPayload | null>(null);
  const [statusError, setStatusError] = React.useState<string | null>(null);
  const [studentSearch, setStudentSearch] = React.useState('');
  const [students, setStudents] = React.useState<
    Array<{ id: string; firstName: string; lastName: string; admissionNo: string }>
  >([]);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [sendForm, setSendForm] = React.useState({
    category: 'GENERAL',
    message: '',
    phoneNumbers: '',
  });

  const { run, pending } = useMutation();

  const resource = useResource<JobRow>('/api/admin/notifications', {
    params: { scope: 'jobs', page, pageSize: 20, q: search, status, category },
    debounceMs: 250,
  });

  const loadStatus = React.useCallback(() => {
    api
      .getOne<StatusPayload>('/api/admin/notifications', { scope: 'status' })
      .then((data) => {
        setStatusData(data);
        setStatusError(null);
      })
      .catch(() => setStatusError('Could not read the notification service status.'));
  }, []);

  React.useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  React.useEffect(() => {
    if (!sendOpen) return;
    const timer = window.setTimeout(() => {
      api
        .getOne<{ rows: typeof students }>('/api/admin/students', {
          pageSize: 25,
          q: studentSearch,
          status: 'ACTIVE',
        })
        .then((data) => setStudents(data.rows ?? []))
        .catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [sendOpen, studentSearch]);

  const retry = async (jobId: string) => {
    const result = await run(
      () => api.put('/api/admin/notifications', { action: 'retry', jobId }),
      { success: 'Message requeued.' },
    );
    if (result) {
      resource.reload();
      loadStatus();
    }
  };

  const drain = async () => {
    const result = await run(
      () => api.put('/api/admin/notifications', { action: 'drain', batchSize: 50 }),
      { success: 'Queue processed.' },
    );
    if (result) {
      resource.reload();
      loadStatus();
    }
  };

  const requeueOrphaned = async () => {
    const result = await run<{ recovered: number }>(
      () => api.put('/api/admin/notifications', { action: 'requeueOrphaned' }),
      { success: 'Stuck messages recovered.' },
    );
    if (result) {
      resource.reload();
      loadStatus();
    }
  };

  const send = async () => {
    const result = await run(
      () =>
        api.post('/api/admin/notifications', {
          studentIds: selected,
          phoneNumbers: sendForm.phoneNumbers
            .split(/[\s,;]+/)
            .map((value) => value.trim())
            .filter(Boolean),
          category: sendForm.category,
          message: sendForm.message.trim(),
          templateKey: 'manual_message',
        }),
      { success: 'Message queued for delivery.' },
    );
    if (result) {
      setSendOpen(false);
      setSelected([]);
      setSendForm({ category: 'GENERAL', message: '', phoneNumbers: '' });
      resource.reload();
      loadStatus();
    }
  };

  const columns: Column<JobRow>[] = [
    {
      key: 'recipient',
      header: 'Recipient',
      cell: (row) => (
        <div className="min-w-0">
          <span className="tabular block truncate text-sm text-[var(--ink)]">
            {row.recipientPhone}
          </span>
          {row.student && (
            <span className="block truncate text-[0.6875rem] text-[var(--ink-subtle)]">
              {row.student.firstName} {row.student.lastName} · {row.student.admissionNo}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      hideBelow: 'md',
      cell: (row) => <Badge tone="brand">{titleCase(row.category)}</Badge>,
    },
    {
      key: 'templateKey',
      header: 'Template',
      hideBelow: 'lg',
      cell: (row) => (
        <span className="tabular text-xs text-[var(--ink-muted)]">{row.templateKey}</span>
      ),
    },
    {
      key: 'attempts',
      header: 'Attempts',
      align: 'right',
      cell: (row) => (
        <span className="tabular text-sm">
          {row.attempts}/{row.maxAttempts}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Queued',
      align: 'right',
      hideBelow: 'md',
      cell: (row) => (
        <span className="tabular text-xs text-[var(--ink-muted)]">
          {formatDateTime(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <div className="min-w-0">
          <Badge tone={STATUS_TONE[row.status] ?? 'neutral'}>{titleCase(row.status)}</Badge>
          {row.errorMessage && (
            <span className="mt-0.5 block max-w-[16rem] truncate text-[0.6875rem] text-[var(--danger)]">
              {row.errorMessage}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) =>
        row.status === 'FAILED' ? (
          <Button variant="ghost" size="sm" onClick={() => retry(row.id)}>
            <RotateCcw />
            Retry
          </Button>
        ) : null,
    },
  ];

  const whatsapp = statusData?.whatsapp;
  const queue = statusData?.queue;
  const queued = queue?.queued ?? 0;
  const failed = queue?.failed ?? 0;
  const sent = (queue?.sent ?? 0) + (queue?.delivered ?? 0);
  const processing = queue?.processing ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp & notifications"
        description="Delivery queue, provider configuration and the message log for every automated alert."
        breadcrumbs={[{ label: 'Communication' }, { label: 'WhatsApp' }]}
        actions={
          <>
            <Button variant="outline" onClick={loadStatus}>
              <RefreshCw />
              Refresh status
            </Button>
            <Button onClick={() => setSendOpen(true)}>
              <Send />
              Send a message
            </Button>
          </>
        }
      />

      {statusError && (
        <Alert tone="danger" title="Status unavailable">
          {statusError}
        </Alert>
      )}

      {whatsapp && !whatsapp.live && (
        <Alert tone="warning" title="WhatsApp is running in mock mode">
          No usable provider credentials are present, so messages are recorded in the queue and marked
          as simulated. Nothing is delivered to real phone numbers. Set the WhatsApp Cloud API
          environment variables to go live — see the README section on WhatsApp configuration.
        </Alert>
      )}

      {whatsapp?.live && (
        <Alert tone="success" title="WhatsApp provider connected">
          Messages are being submitted to the WhatsApp Cloud API (Graph {whatsapp.graphVersion}) in
          cloud mode. Delivery reports arrive by webhook and update the log below.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Queued"
          value={formatNumber(queued)}
          icon={<MessageCircle />}
          tone={queued > 0 ? 'info' : 'success'}
        />
        <StatCard
          label="In flight"
          value={formatNumber(processing)}
          icon={<ServerCog />}
          tone="brand"
        />
        <StatCard label="Delivered" value={formatNumber(sent)} icon={<CheckCircle2 />} tone="success" />
        <StatCard
          label="Failed"
          value={formatNumber(failed)}
          icon={<AlertTriangle />}
          tone={failed > 0 ? 'danger' : 'success'}
          hint={failed > 0 ? 'Retry individually below' : 'Nothing to retry'}
        />
      </div>

      {whatsapp && (
        <Card>
          <CardHeader
            title="Provider configuration"
            description={`Mode: ${whatsapp.mode} (configured: ${whatsapp.configuredMode}) · Graph ${whatsapp.graphVersion}`}
            icon={<ServerCog />}
            action={
              <div className="flex flex-wrap gap-1.5">
                <Badge tone={whatsapp.hasAccessToken ? 'success' : 'danger'}>
                  Access token {whatsapp.hasAccessToken ? 'set' : 'missing'}
                </Badge>
                <Badge tone={whatsapp.hasPhoneNumberId ? 'success' : 'danger'}>
                  Phone number ID {whatsapp.hasPhoneNumberId ? 'set' : 'missing'}
                </Badge>
                <Badge tone={whatsapp.hasWebhookToken ? 'success' : 'warning'}>
                  Verify token {whatsapp.hasWebhookToken ? 'set' : 'missing'}
                </Badge>
                <Badge tone={whatsapp.hasAppSecret ? 'success' : 'warning'}>
                  App secret {whatsapp.hasAppSecret ? 'set' : 'missing'}
                </Badge>
              </div>
            }
          />
          <div className="space-y-3 p-4 sm:p-5">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ['Locale', whatsapp.defaultLocale],
                ['Quiet hours', `${whatsapp.quietHours.start} – ${whatsapp.quietHours.end}`],
                ['Rate limit', `${whatsapp.rateLimitPerMinute}/min`],
                ['Last 24h', `${formatNumber(queue?.last24hTotal ?? 0)} sent`],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-[var(--ink-subtle)]">{label}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-[var(--ink)]">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-[var(--ink-muted)]">
              Credentials are read from environment variables on the server and are never sent to the
              browser. The badges above only report whether each value is present.
            </p>
            {(queue?.last24hSimulated ?? 0) > 0 && (
              <p className="text-xs text-[var(--warn-soft-ink)]">
                {formatNumber(queue?.last24hSimulated ?? 0)} of the last 24 hours’ messages were
                simulated, not delivered.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={drain} loading={pending}>
                <Send />
                Process queue now
              </Button>
              <Button variant="outline" size="sm" onClick={requeueOrphaned} loading={pending}>
                <RotateCcw />
                Recover stuck messages
              </Button>
            </div>
          </div>
        </Card>
      )}

      {resource.error && (
        <Alert tone="danger" title="Could not load the message log">
          {resource.error}
        </Alert>
      )}

      <DataTable<JobRow>
        columns={columns}
        rows={resource.rows}
        rowKey={(row) => row.id}
        loading={resource.loading}
        searchable
        searchPlaceholder="Search by phone number or template…"
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: ['QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED'].map(
              (value) => ({ value, label: titleCase(value) }),
            ),
          },
          {
            key: 'category',
            label: 'Category',
            options: CATEGORIES.map((value) => ({ value, label: titleCase(value) })),
          },
        ]}
        filterValues={{ status, category }}
        onFilterChange={(key, value) => {
          if (key === 'status') setStatus(value);
          if (key === 'category') setCategory(value);
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
        emptyTitle="No messages yet"
        emptyDescription="Absence alerts, fee reminders and result notifications appear here as they are queued."
        toolbarExtra={
          <Button variant="outline" size="sm" onClick={resource.reload} loading={resource.refreshing}>
            <RefreshCw />
            Refresh
          </Button>
        }
      />

      <Modal
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        title="Send a WhatsApp message"
        description="Choose guardians by student, or enter phone numbers directly."
        size="lg"
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="outline" onClick={() => setSendOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              onClick={send}
              loading={pending}
              disabled={
                !sendForm.message.trim() ||
                (selected.length === 0 && !sendForm.phoneNumbers.trim())
              }
            >
              <Send />
              Queue message
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="info" title="Sending is queued, not instant">
            Messages enter the delivery queue so rate limits and retries are handled for you. Duplicate
            recipients are removed automatically.
          </Alert>

          <Field label="Category" htmlFor="send-category" required>
            <Select
              id="send-category"
              value={sendForm.category}
              onChange={(e) => setSendForm((p) => ({ ...p, category: e.target.value }))}
            >
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {titleCase(value)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Message" htmlFor="send-message" required>
            <Textarea
              id="send-message"
              rows={4}
              value={sendForm.message}
              onChange={(e) => setSendForm((p) => ({ ...p, message: e.target.value }))}
              placeholder="Dear Parent/Guardian, …"
            />
          </Field>

          <Field
            label="Recipients by student"
            htmlFor="send-students"
            hint="Messages go to each student's primary guardian."
          >
            <div className="space-y-2">
              <Input
                id="send-students"
                type="search"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Search students…"
              />
              <div className="scrollbar-slim max-h-40 space-y-0.5 overflow-y-auto rounded-md border border-[var(--line)] p-2">
                {students.length === 0 ? (
                  <p className="p-2 text-xs text-[var(--ink-subtle)]">No students matched.</p>
                ) : (
                  students.map((student) => (
                    <label
                      key={student.id}
                      className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-[var(--surface-hover)]"
                    >
                      <Checkbox
                        checked={selected.includes(student.id)}
                        onChange={(e) =>
                          setSelected((prev) =>
                            e.target.checked
                              ? [...prev, student.id]
                              : prev.filter((id) => id !== student.id),
                          )
                        }
                      />
                      <span className="min-w-0 flex-1 truncate text-[var(--ink)]">
                        {student.firstName} {student.lastName}
                      </span>
                      <span className="tabular text-xs text-[var(--ink-subtle)]">
                        {student.admissionNo}
                      </span>
                    </label>
                  ))
                )}
              </div>
              {selected.length > 0 && (
                <p className="text-xs text-[var(--ink-muted)]">
                  <Users className="mr-1 inline size-3.5" />
                  {selected.length} student(s) selected
                </p>
              )}
            </div>
          </Field>

          <Field
            label="Or additional phone numbers"
            htmlFor="send-phones"
            hint="Separate with commas or spaces. Include the country code."
          >
            <Textarea
              id="send-phones"
              rows={2}
              value={sendForm.phoneNumbers}
              onChange={(e) => setSendForm((p) => ({ ...p, phoneNumbers: e.target.value }))}
              placeholder="+923001234567, +923009876543"
            />
          </Field>
        </div>
      </Modal>

      {resource.rows.length === 0 && !resource.loading && (
        <EmptyState
          icon={<MessageCircle />}
          title="No messages in the log"
          description="Mark attendance or publish results to generate automatic WhatsApp notifications."
          className="border-0"
        />
      )}
    </div>
  );
}
