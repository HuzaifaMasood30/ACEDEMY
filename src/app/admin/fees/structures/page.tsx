import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { FeeStructuresClient } from './structures-client';

export const metadata = { title: 'Fee structures' };

export default async function FeeStructuresPage() {
  await requirePagePermission(PERMISSIONS.FEE_STRUCTURE_VIEW);
  return <FeeStructuresClient />;
}
