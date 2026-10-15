import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { NotificationsClient } from './notifications-client';

export const metadata = { title: 'WhatsApp & notifications' };

export default async function NotificationsPage() {
  await requirePagePermission(PERMISSIONS.NOTIFICATION_VIEW_LOGS);
  return <NotificationsClient />;
}
