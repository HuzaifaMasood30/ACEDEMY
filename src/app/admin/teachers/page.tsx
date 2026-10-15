import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { TeachersClient } from './teachers-client';

export const metadata = { title: 'Teachers' };

export default async function TeachersPage() {
  await requirePagePermission(PERMISSIONS.TEACHER_VIEW);
  return <TeachersClient />;
}
