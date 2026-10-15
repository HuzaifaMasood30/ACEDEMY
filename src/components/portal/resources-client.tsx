'use client';

import * as React from 'react';
import { Download, FolderOpen } from 'lucide-react';
import {
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
} from '@/components/ui/structure';
import { Alert, Badge, Button, Field, Select } from '@/components/ui/primitives';
import { ChildSelector, usePortalContext } from './portal-context';
import { list } from '@/lib/client-api';

interface ResourceRow {
  id: string;
  title: string;
  description: string | null;
  category: string;
  fileUrl: string;
  fileType: string | null;
  fileSize: number | null;
  classSectionId: string | null;
  createdAt: string;
  subject: { id: string; name: string } | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  NOTE: 'Notes',
  WORKSHEET: 'Worksheet',
  SLIDES: 'Slides',
  VIDEO: 'Video',
  PAST_PAPER: 'Past paper',
  SYLLABUS: 'Syllabus',
  OTHER: 'Other',
};

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Learning materials filtered to the actor's classes, with a category filter. */
export function ResourcesClient() {
  const context = usePortalContext();
  const [rows, setRows] = React.useState<ResourceRow[]>([]);
  const [category, setCategory] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await list<ResourceRow>('/api/resources', {
        category: category || undefined,
        pageSize: 60,
      });
      setRows(result.rows);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load resources.');
    } finally {
      setLoading(false);
    }
  }, [category]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const categories = React.useMemo(
    () => Array.from(new Set(rows.map((row) => row.category))).sort(),
    [rows],
  );

  const byCategory = React.useMemo(() => {
    const grouped = new Map<string, ResourceRow[]>();
    for (const row of rows) {
      const list = grouped.get(row.category) ?? [];
      list.push(row);
      grouped.set(row.category, list);
    }
    return grouped;
  }, [rows]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Learning resources"
        description="Notes, worksheets and reference material for your classes."
        actions={<ChildSelector context={context} />}
      />

      {error && <Alert tone="danger" title="Could not load resources">{error}</Alert>}

      {categories.length > 1 && (
        <Card>
          <CardHeader title="Filter" description="Show a single kind of material." />
          <div className="p-4 sm:p-5">
            <Field label="Category" htmlFor="res-cat">
              <Select id="res-cat" value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="">All categories</option>
                {categories.map((value) => (
                  <option key={value} value={value}>
                    {CATEGORY_LABEL[value] ?? value}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div key={index} className="skeleton h-32 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <div className="p-5">
            <EmptyState
              icon={<FolderOpen />}
              title="No resources yet"
              description="Teachers will share notes and worksheets here as the course progresses."
            />
          </div>
        </Card>
      ) : (
        Array.from(byCategory, ([value, items]) => (
          <Card key={value}>
            <CardHeader
              title={CATEGORY_LABEL[value] ?? value}
              description={`${items.length} item${items.length === 1 ? '' : 's'}`}
              icon={<FolderOpen />}
            />
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-5">
              {items.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-col justify-between rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--brand)]"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-[var(--ink)]">{row.title}</h3>
                      {row.subject && <Badge tone="brand">{row.subject.name}</Badge>}
                    </div>
                    {row.description && (
                      <p className="mt-2 line-clamp-3 text-xs text-[var(--ink-muted)]">
                        {row.description}
                      </p>
                    )}
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <span className="text-xs text-[var(--ink-subtle)]">
                      {[
                        row.fileType?.toUpperCase(),
                        formatSize(row.fileSize),
                        !row.classSectionId ? 'Academy-wide' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    <a
                      href={row.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--brand-soft-ink)] hover:bg-[var(--surface-hover)]"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Open
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))
      )}

      <div className="flex justify-end">
        <Button variant="ghost" onClick={() => void load()} loading={loading}>
          Refresh
        </Button>
      </div>
    </div>
  );
}
