import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { AttendanceClient } from './attendance-client';

export const metadata = { title: 'Attendance' };

export default async function AttendancePage() {
  await requirePagePermission(PERMISSIONS.ATTENDANCE_VIEW);
  return <AttendanceClient />;
}
