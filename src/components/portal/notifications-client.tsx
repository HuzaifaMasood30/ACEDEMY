'use client';

import * as React from 'react';
import { Bell, CheckCheck } from 'lucide-react';
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
import { Alert, Badge, Button } from '@/components/ui/primitives';
import { api } from '@/lib/client-api';

interface NotificationRow {
  id: string;
  category: string;
  channel: string;
  status: string;
  body: string;
  locale: string;
  relatedEntity: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  ATTENDANCE_ABSENCE: 'Absence',
  FEE_REMINDER: 'Fee reminder',
  FEE_OVERDUE: 'Fee overdue',
  EXAM_REMINDER: 'Exam reminder',
  RESULT_PUBLISHED: 'Result published',
  TIMETABLE_CHANGE: 'Timetable change',
  ASSIGNMENT_NEW: 'New assignment',
  ASSIGNMENT_DUE: 'Assignment due',
  ANNOUNCEMENT: 'Announcement',
  ADMISSION_UPDATE: 'Admission update',
  ACCOUNT: 'Account',
  MANUAL: 'Message',
};

const STATUS_TONE: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'brand'> = {
  SENT: 'success',
  DELIVERED: 'success',
  READ: 'success',
  QUEUED: 'info',
  RETRYING: 'warning',
  FAILED: 'danger',
  CANCELLED: 'brand',
  SKIPPED: 'brand',
};

/**
 * The account's own notification history.
 *
 * This is the delivery record, so it is honest about provider state: a message
 * still in the queue is labelled as queued rather than sent.
 */
export function NotificationsClient() {
  const [rows, setRows] = React.useState<NotificationRow[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [marking, setMarking] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<NotificationRow[]>('/api/notifications', { pageSize: 50 });
      setRows(response.data);
      setUnread((response.meta as { unread?: number } | null)?.unread ?? 0);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const markAllRead = async () => {
    setMarking(true);
    try {
      const result = await api.patch<{ updated: number }>('/api/notifications', { all: true });
      toast.success(`${result.updated} notification${result.updated === 1 ? '' : 's'} marked read.`);
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not update notifications.');
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Messages the academy has sent to your account."
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => void load()} loading={loading}>
              Refresh
            </Button>
            <Button variant="outline" onClick={markAllRead} loading={marking} disabled={unread === 0}>
              <CheckCheck />
              Mark all read{unread > 0 ? ` (${unread})` : ''}
            </Button>
          </div>
        }
      />

      {error && <Alert tone="danger" title="Could not load notifications">{error}</Alert>}

      <Card>
        <CardHeader
          title="Message history"
          description="Delivery status is reported exactly as the provider returned it."
          icon={<Bell />}
        />
        {loading ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="skeleton h-12 rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<Bell />}
              title="No notifications"
              description="Absence alerts, fee reminders and result announcements will appear here."
            />
          </div>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Message</Th>
                <Th hideBelow="md">Category</Th>
                <Th>Status</Th>
                <Th hideBelow="lg">Sent</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr key={row.id}>
                  <Td>
                    <div className="min-w-0 max-w-md">
                      <p
                        className={`truncate text-sm ${
                          row.readAt ? 'text-[var(--ink-muted)]' : 'font-medium text-[var(--ink)]'
                        }`}
                      >
                        {row.body}
                      </p>
                      {!row.readAt && <span className="text-xs text-[var(--brand-soft-ink)]">Unread</span>}
                    </div>
                  </Td>
                  <Td hideBelow="md">
                    <span className="text-xs text-[var(--ink-muted)]">
                      {CATEGORY_LABEL[row.category] ?? row.category}
                    </span>
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[row.status] ?? 'brand'}>
                      {row.status.toLowerCase()}
                    </Badge>
                  </Td>
                  <Td hideBelow="lg">
                    <span className="tabular text-xs text-[var(--ink-muted)]">
                      {row.sentAt
                        ? new Date(row.sentAt).toLocaleString(undefined, {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
