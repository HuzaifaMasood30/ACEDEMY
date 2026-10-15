import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { TimetableClient } from '@/components/portal/timetable-client';

export const metadata = { title: 'My timetable' };

export default async function Page() {
  await requirePagePermission(PERMISSIONS.TIMETABLE_VIEW);
  return <TimetableClient />;
}
