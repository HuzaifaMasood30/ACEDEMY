import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { AdmissionsClient } from './admissions-client';

export const metadata = { title: 'Admissions' };

export default async function AdmissionsPage() {
  await requirePagePermission(PERMISSIONS.APPLICATION_VIEW);
  return <AdmissionsClient />;
}
