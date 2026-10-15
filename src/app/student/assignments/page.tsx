import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { AssignmentsClient } from '@/components/portal/assignments-client';

export const metadata = { title: 'Assignments' };

export default async function Page() {
  await requirePagePermission(PERMISSIONS.ASSIGNMENT_VIEW);
  return <AssignmentsClient />;
}
