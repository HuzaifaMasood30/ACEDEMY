import { AppShell } from '@/components/app-shell';
import { buildPortalContext } from '@/server/page-guard';
import { Role } from '@prisma/client';
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Parent portal' };

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { actor, sections, unreadNotifications } = await buildPortalContext(Role.PARENT);

  return (
    <AppShell
      user={{
        id: actor.id,
        name: actor.name,
        email: actor.email,
        role: actor.role,
        permissions: Array.from(actor.permissions),
      }}
      sections={sections}
      portalName="Parent portal"
      portalBadge="Your linked children only"
      unreadNotifications={unreadNotifications}
      profileHref="/parent/preferences"
    >
      {children}
    </AppShell>
  );
}
