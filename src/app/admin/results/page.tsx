import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { ResultsClient } from './results-client';

export const metadata = { title: 'Results' };

export default async function ResultsPage() {
  await requirePagePermission(PERMISSIONS.MARKS_VIEW);
  return <ResultsClient />;
}
