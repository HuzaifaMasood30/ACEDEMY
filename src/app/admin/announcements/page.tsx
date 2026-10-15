import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { AnnouncementsClient } from './announcements-client';

export const metadata = { title: 'Announcements' };

export default async function AnnouncementsPage() {
  await requirePagePermission(PERMISSIONS.ANNOUNCEMENT_VIEW);
  return <AnnouncementsClient />;
}
