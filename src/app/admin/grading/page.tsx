import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { GradingClient } from './grading-client';

export const metadata = { title: 'Grading scales' };

export default async function GradingPage() {
  await requirePagePermission(PERMISSIONS.GRADING_MANAGE);
  return <GradingClient />;
}
