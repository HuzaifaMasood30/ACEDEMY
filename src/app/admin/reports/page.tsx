import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { ReportsClient } from './reports-client';

export const metadata = { title: 'Reports' };

export default async function ReportsPage() {
  await requirePagePermission(PERMISSIONS.REPORT_VIEW);
  return <ReportsClient />;
}
