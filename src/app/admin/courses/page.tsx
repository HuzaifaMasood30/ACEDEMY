import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { CoursesClient } from './courses-client';

export const metadata = { title: 'Courses' };

export default async function CoursesPage() {
  await requirePagePermission(PERMISSIONS.COURSE_VIEW);
  return <CoursesClient />;
}
