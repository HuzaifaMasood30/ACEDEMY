import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { ClassesClient } from './classes-client';

export const metadata = { title: 'My classes' };

export default async function Page() {
  await requirePagePermission(PERMISSIONS.CLASS_VIEW);
  return <ClassesClient />;
}
