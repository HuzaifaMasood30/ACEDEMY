import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { AuditClient } from './audit-client';

export const metadata = { title: 'Audit log' };

export default async function AuditPage() {
  await requirePagePermission(PERMISSIONS.AUDIT_VIEW);
  return <AuditClient />;
}
