import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { FeesClient } from '@/components/portal/fees-client';

export const metadata = { title: 'Fees & invoices' };

export default async function Page() {
  await requirePagePermission(PERMISSIONS.INVOICE_VIEW);
  return <FeesClient />;
}
