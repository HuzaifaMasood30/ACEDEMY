'use client';

import * as React from 'react';
import { Megaphone } from 'lucide-react';
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
import { list } from '@/lib/client-api';

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  audience: string;
  priority: string;
  publishedAt: string | null;
  createdAt: string;
  expiresAt: string | null;
  classSection: { id: string; name: string } | null;
  createdBy: { name: string } | null;
}

const PRIORITY_TONE: Record<string, 'danger' | 'warning' | 'brand' | 'info'> = {
  URGENT: 'danger',
  HIGH: 'warning',
  NORMAL: 'brand',
  LOW: 'info',
};

/**
 * Notices shown to the signed-in portal.
 *
 * The API already limits this to announcements addressed to the actor's role or
 * classes, so the page only has to render what it receives.
 */
export function AnnouncementsClient() {
  const [rows, setRows] = React.useState<AnnouncementRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await list<AnnouncementRow>('/api/admin/announcements', { pageSize: 50 });
      setRows(result.rows);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load announcements.');
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
        title="Announcements"
        description="Notices and updates from the academy."
        actions={
          <Button variant="ghost" onClick={() => void load()} loading={loading}>
            Refresh
          </Button>
        }
      />

      {error && <Alert tone="danger" title="Could not load announcements">{error}</Alert>}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="skeleton h-24 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <div className="p-5">
            <EmptyState
              icon={<Megaphone />}
              title="No announcements"
              description="Academy notices will appear here as soon as they are published."
            />
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const isOpen = expanded === row.id;
            return (
              <Card key={row.id}>
                <div className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-[var(--ink)]">{row.title}</h3>
                        <Badge tone={PRIORITY_TONE[row.priority] ?? 'brand'}>
                          {row.priority.toLowerCase()}
                        </Badge>
                        {row.classSection && <Badge tone="info">{row.classSection.name}</Badge>}
                      </div>
                      <p className="mt-1 text-xs text-[var(--ink-muted)]">
                        {new Date(row.publishedAt ?? row.createdAt).toLocaleDateString(undefined, {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                        })}
                        {row.createdBy ? ` · ${row.createdBy.name}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : row.id)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-[var(--brand-soft-ink)] hover:bg-[var(--surface-hover)]"
                      aria-expanded={isOpen}
                    >
                      {isOpen ? 'Show less' : 'Read more'}
                    </button>
                  </div>
                  <p
                    className={`mt-3 whitespace-pre-wrap text-sm text-[var(--ink-muted)] ${
                      isOpen ? '' : 'line-clamp-2'
                    }`}
                  >
                    {row.body}
                  </p>
                  {row.expiresAt && (
                    <p className="mt-2 text-xs text-[var(--ink-subtle)]">
                      Valid until{' '}
                      {new Date(row.expiresAt).toLocaleDateString(undefined, {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
