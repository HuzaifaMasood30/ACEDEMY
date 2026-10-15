import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { ChildrenClient } from './children-client';

export const metadata = { title: 'My children' };

export default async function Page() {
  await requirePagePermission(PERMISSIONS.GUARDIAN_VIEW);
  return <ChildrenClient />;
}
