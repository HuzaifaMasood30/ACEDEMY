import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { AttendanceClient } from '@/components/portal/attendance-client';

export const metadata = { title: 'Attendance' };

export default async function Page() {
  await requirePagePermission(PERMISSIONS.ATTENDANCE_MARK);
  return <AttendanceClient />;
}
