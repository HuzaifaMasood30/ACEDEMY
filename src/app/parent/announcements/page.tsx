import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { AnnouncementsClient } from '@/components/portal/announcements-client';

export const metadata = { title: 'Announcements' };

export default async function Page() {
  await requirePagePermission(PERMISSIONS.ANNOUNCEMENT_VIEW);
  return <AnnouncementsClient />;
}
