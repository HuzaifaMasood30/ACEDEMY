import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { ClassesClient } from './classes-client';

export const metadata = { title: 'Classes' };

export default async function ClassesPage() {
  await requirePagePermission(PERMISSIONS.CLASS_VIEW);
  return <ClassesClient />;
}
