import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { AlertsClient } from './alerts-client';

export const metadata = { title: 'Student alerts' };

export default async function AlertsPage() {
  await requirePagePermission(PERMISSIONS.PROGRESS_VIEW);
  return <AlertsClient />;
}
