import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { SubjectsClient } from './subjects-client';

export const metadata = { title: 'Subjects' };

export default async function SubjectsPage() {
  await requirePagePermission(PERMISSIONS.SUBJECT_VIEW);
  return <SubjectsClient />;
}
