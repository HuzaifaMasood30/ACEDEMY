'use client';

import * as React from 'react';
import { CalendarX, Plus } from 'lucide-react';
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
import { Alert, Badge, Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/overlays';
import { api, list } from '@/lib/client-api';

interface LeaveRow {
  id: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: string;
  reviewNotes: string | null;
  createdAt: string;
  reviewedBy?: { name: string } | null;
}

const STATUS_TONE: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'brand'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'brand',
};

const TYPE_LABEL: Record<string, string> = {
  SICK: 'Sick leave',
  CASUAL: 'Casual leave',
  PERSONAL: 'Personal',
  EMERGENCY: 'Emergency',
  OTHER: 'Other',
};

/** A teacher's own leave requests. */
export function LeaveClient() {
  const [rows, setRows] = React.useState<LeaveRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await list<LeaveRow>('/api/leave', { pageSize: 50 });
      setRows(result.rows);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load leave requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave requests"
        description="Request time off and track the outcome."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus />
            New request
          </Button>
        }
      />

      {error && <Alert tone="danger" title="Could not load leave requests">{error}</Alert>}

      <Card>
        <CardHeader title="My requests" description={`${rows.length} request${rows.length === 1 ? '' : 's'}`} />
        {loading ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2].map((index) => (
              <div key={index} className="skeleton h-12 rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<CalendarX />}
              title="No leave requests"
              description="Submit a request when you need time away from teaching."
            />
          </div>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Type</Th>
                <Th>From</Th>
                <Th>To</Th>
                <Th hideBelow="md">Reason</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr key={row.id}>
                  <Td>{TYPE_LABEL[row.leaveType] ?? row.leaveType}</Td>
                  <Td>
                    <span className="tabular text-sm">
                      {new Date(row.startDate).toLocaleDateString(undefined, {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </span>
                  </Td>
                  <Td>
                    <span className="tabular text-sm">
                      {new Date(row.endDate).toLocaleDateString(undefined, {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </span>
                  </Td>
                  <Td hideBelow="md">
                    <span className="line-clamp-1 text-sm text-[var(--ink-muted)]">
                      {row.reason ?? '—'}
                    </span>
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[row.status] ?? 'brand'}>
                      {row.status.toLowerCase()}
                    </Badge>
                  </Td>
                  <Td>
                    {row.status === 'PENDING' && (
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            try {
                              await api.patch('/api/leave', { id: row.id, status: 'CANCELLED' });
                              toast.success('Request cancelled.');
                              await load();
                            } catch (caught) {
                              toast.error(
                                caught instanceof Error ? caught.message : 'Could not cancel.',
                              );
                            }
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      {creating && (
        <CreateLeaveModal
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function CreateLeaveModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [leaveType, setLeaveType] = React.useState('SICK');
  const [startDate, setStartDate] = React.useState(today);
  const [endDate, setEndDate] = React.useState(today);
  const [reason, setReason] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    if (new Date(endDate) < new Date(startDate)) {
      setError('The end date cannot be before the start date.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/api/leave', {
        leaveType,
        startDate,
        endDate,
        reason: reason.trim() || null,
      });
      toast.success('Leave request submitted.');
      await onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not submit the request.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="New leave request">
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Leave type" htmlFor="lv-type">
          <Select id="lv-type" value={leaveType} onChange={(event) => setLeaveType(event.target.value)}>
            {Object.entries(TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From" htmlFor="lv-start">
            <Input
              id="lv-start"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </Field>
          <Field label="To" htmlFor="lv-end">
            <Input
              id="lv-end"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </Field>
        </div>
        <Field label="Reason" htmlFor="lv-reason" hint="Optional, but it helps the administrator decide.">
          <Textarea
            id="lv-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={1000}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            Submit request
          </Button>
        </div>
      </div>
    </Modal>
  );
}
