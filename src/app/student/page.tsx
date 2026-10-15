import { requirePageActor } from '@/server/page-guard';
import { Role } from '@prisma/client';
import { StudentDashboardClient } from '@/components/portal/student-dashboard';

export const metadata = { title: 'Student dashboard' };

export default async function Page() {
  await requirePageActor(Role.STUDENT);
  return <StudentDashboardClient />;
}
