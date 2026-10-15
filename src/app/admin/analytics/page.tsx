import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { AnalyticsClient } from './analytics-client';

export const metadata = { title: 'Analytics' };

export default async function AnalyticsPage() {
  await requirePagePermission(PERMISSIONS.ACADEMY_VIEW);
  return <AnalyticsClient />;
}
