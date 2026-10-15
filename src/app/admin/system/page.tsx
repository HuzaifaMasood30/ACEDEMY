import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { SystemClient } from './system-client';

export const metadata = { title: 'System health' };

export default async function SystemPage() {
  await requirePagePermission(PERMISSIONS.SYSTEM_BACKUP);
  return <SystemClient />;
}
