import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { ResourcesClient } from '@/components/portal/resources-client';

export const metadata = { title: 'Learning resources' };

export default async function Page() {
  await requirePagePermission(PERMISSIONS.RESOURCE_VIEW);
  return <ResourcesClient />;
}
