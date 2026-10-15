import { requirePageActor } from '@/server/page-guard';
import { Role } from '@prisma/client';
import { ParentDashboardClient } from '@/components/portal/parent-dashboard';

export const metadata = { title: 'Parent dashboard' };

export default async function Page() {
  await requirePageActor(Role.PARENT);
  return <ParentDashboardClient />;
}
