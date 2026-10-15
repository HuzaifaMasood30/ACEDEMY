import { AppShell } from '@/components/app-shell';
import { buildPortalContext } from '@/server/page-guard';
import { Role } from '@prisma/client';
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Administration' };

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { actor, sections, unreadNotifications } = await buildPortalContext(Role.ADMIN);

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
      portalName="Administration"
      portalBadge="Full academy access"
      unreadNotifications={unreadNotifications}
      profileHref="/admin/profile"
    >
      {children}
    </AppShell>
  );
}
