import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { DuesClient } from './dues-client';

export const metadata = { title: 'Outstanding dues' };

export default async function DuesPage() {
  await requirePagePermission(PERMISSIONS.INVOICE_VIEW);
  return <DuesClient />;
}
