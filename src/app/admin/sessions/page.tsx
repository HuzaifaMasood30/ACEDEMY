import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { SessionsClient } from './sessions-client';

export const metadata = { title: 'Academic sessions' };

export default async function SessionsPage() {
  await requirePagePermission(PERMISSIONS.SESSION_VIEW);
  return <SessionsClient />;
}
