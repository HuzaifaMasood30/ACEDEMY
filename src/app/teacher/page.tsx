import { requirePageActor } from '@/server/page-guard';
import { Role } from '@prisma/client';
import { TeacherDashboardClient } from '@/components/portal/teacher-dashboard';

export const metadata = { title: 'Teacher dashboard' };

export default async function Page() {
  await requirePageActor(Role.TEACHER);
  return <TeacherDashboardClient />;
}
