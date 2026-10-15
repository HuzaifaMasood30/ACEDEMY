import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { PaymentsClient } from './payments-client';

export const metadata = { title: 'Payments' };

export default async function PaymentsPage() {
  await requirePagePermission(PERMISSIONS.PAYMENT_VIEW);
  return <PaymentsClient />;
}
