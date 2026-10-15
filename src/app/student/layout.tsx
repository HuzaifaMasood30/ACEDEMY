import { AppShell } from '@/components/app-shell';
import { buildPortalContext } from '@/server/page-guard';
import { Role } from '@prisma/client';
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Student portal' };

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { actor, sections, unreadNotifications } = await buildPortalContext(Role.STUDENT);

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
      portalName="Student portal"
      portalBadge="Your records only"
      unreadNotifications={unreadNotifications}
      profileHref="/student/profile"
    >
      {children}
    </AppShell>
  );
}
