import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { InvoicesClient } from './invoices-client';

export const metadata = { title: 'Invoices' };

export default async function InvoicesPage() {
  await requirePagePermission(PERMISSIONS.INVOICE_VIEW);
  return <InvoicesClient />;
}
