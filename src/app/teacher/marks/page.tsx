import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { MarksClient } from './marks-client';

export const metadata = { title: 'Marks entry' };

export default async function Page() {
  await requirePagePermission(PERMISSIONS.MARKS_ENTER);
  return <MarksClient />;
}
