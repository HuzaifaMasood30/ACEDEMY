import { Megaphone, Pin } from 'lucide-react';
import { Badge } from '@/components/ui/primitives';
import { Card, EmptyState, PageHeader } from '@/components/ui/structure';
import { getPublicNotices } from '@/server/public-data';
import { formatDate } from '@/lib/format';

export const metadata = { title: 'Notices' };

const CATEGORY_TONES: Record<string, 'brand' | 'info' | 'warning' | 'success' | 'neutral'> = {
  ACADEMIC: 'info',
  EVENT: 'brand',
  FINANCE: 'warning',
  HOLIDAY: 'success',
  GENERAL: 'neutral',
};

export default async function NoticesPage() {
  const notices = await getPublicNotices(50);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
      <PageHeader
        title="Academy notices"
        description="Announcements published by the academy office. Students and parents see these alongside their personal notices after signing in."
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Notices' }]}
      />

      {notices.length === 0 ? (
        <EmptyState
          className="mt-10"
          icon={<Megaphone />}
          title="No notices published"
          description="There are no public notices at the moment. Check back later or contact the academy office."
        />
      ) : (
        <div className="mt-10 space-y-4">
          {notices.map((notice) => (
            <Card
              key={notice.id}
              className={
                notice.isPinned
                  ? 'border-l-3 border-l-[var(--brand)] p-5'
                  : 'p-5'
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                {notice.isPinned && (
                  <Badge tone="brand">
                    <Pin className="size-3.5" />
                    Pinned
                  </Badge>
                )}
                <Badge tone={CATEGORY_TONES[notice.category] ?? 'neutral'}>
                  {notice.category}
                </Badge>
                {notice.priority === 'HIGH' && <Badge tone="warning">Important</Badge>}
                <span className="ml-auto text-xs text-[var(--ink-subtle)]">
                  {formatDate(notice.publishAt)}
                </span>
              </div>

              <h2 className="mt-3 text-base font-semibold text-[var(--ink)]">
                {notice.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-[var(--ink-muted)]">
                {notice.body}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
