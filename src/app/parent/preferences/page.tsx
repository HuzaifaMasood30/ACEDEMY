import { requirePageActor } from '@/server/page-guard';
import { Role } from '@prisma/client';
import { PreferencesClient } from './preferences-client';

export const metadata = { title: 'Preferences' };

export default async function Page() {
  await requirePageActor(Role.PARENT);
  return <PreferencesClient />;
}
