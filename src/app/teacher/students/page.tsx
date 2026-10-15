import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { StudentsClient } from './students-client';

export const metadata = { title: 'My students' };

export default async function Page() {
  await requirePagePermission(PERMISSIONS.STUDENT_VIEW);
  return <StudentsClient />;
}
