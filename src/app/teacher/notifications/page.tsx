import { requirePageActor } from '@/server/page-guard';
import { Role } from '@prisma/client';
import { NotificationsClient } from '@/components/portal/notifications-client';

export const metadata = { title: 'Notifications' };

export default async function Page() {
  await requirePageActor(Role.TEACHER);
  return <NotificationsClient />;
}
