import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { UsersClient } from './users-client';

export const metadata = { title: 'User accounts' };

export default async function UsersPage() {
  await requirePagePermission(PERMISSIONS.USER_VIEW);
  return <UsersClient />;
}
