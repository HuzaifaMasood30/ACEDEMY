import { requirePageActor } from '@/server/page-guard';
import { Role } from '@prisma/client';
import { LeaveClient } from './leave-client';

export const metadata = { title: 'Leave requests' };

export default async function Page() {
  await requirePageActor(Role.TEACHER);
  return <LeaveClient />;
}
