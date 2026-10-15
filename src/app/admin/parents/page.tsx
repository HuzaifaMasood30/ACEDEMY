import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { ParentsClient } from './parents-client';

export const metadata = { title: 'Parents' };

export default async function ParentsPage() {
  await requirePagePermission(PERMISSIONS.GUARDIAN_VIEW);
  return <ParentsClient />;
}
