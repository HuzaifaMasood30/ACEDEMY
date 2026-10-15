import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { ExamsClient } from './exams-client';

export const metadata = { title: 'Examinations' };

export default async function ExamsPage() {
  await requirePagePermission(PERMISSIONS.EXAM_VIEW);
  return <ExamsClient />;
}
