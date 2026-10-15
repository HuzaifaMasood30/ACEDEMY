import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { ExamsClient } from '@/components/portal/exams-client';

export const metadata = { title: 'Examinations' };

export default async function Page() {
  await requirePagePermission(PERMISSIONS.EXAM_VIEW);
  return <ExamsClient />;
}
