import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { ResultsClient } from '@/components/portal/results-client';

export const metadata = { title: 'Results' };

export default async function Page() {
  await requirePagePermission(PERMISSIONS.MARKS_VIEW);
  return <ResultsClient />;
}
