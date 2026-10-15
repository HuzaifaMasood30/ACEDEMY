import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { StudentsClient } from './students-client';

export const metadata = { title: 'Students' };

export default async function StudentsPage() {
  await requirePagePermission(PERMISSIONS.STUDENT_VIEW);
  return <StudentsClient />;
}
