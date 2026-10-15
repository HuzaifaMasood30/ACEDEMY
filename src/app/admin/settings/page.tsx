import { requirePagePermission } from '@/server/page-guard';
import { PERMISSIONS } from '@/lib/rbac';
import { SettingsClient } from './settings-client';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  await requirePagePermission(PERMISSIONS.SETTINGS_VIEW);
  return <SettingsClient />;
}
