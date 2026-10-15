import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { TimetableClient } from './timetable-client';

export const metadata = { title: 'Timetable' };

export default async function TimetablePage() {
  await requirePagePermission(PERMISSIONS.TIMETABLE_VIEW);
  return <TimetableClient />;
}
