import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { ProgressClient } from '@/components/portal/progress-client';

export const metadata = { title: 'My progress' };

export default async function Page() {
  await requirePagePermission(PERMISSIONS.PROGRESS_VIEW);
  return <ProgressClient />;
}
