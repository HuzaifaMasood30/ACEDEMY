import { AppShell } from '@/components/app-shell';
import { buildPortalContext } from '@/server/page-guard';
import { Role } from '@prisma/client';
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Teacher portal' };

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { actor, sections, unreadNotifications } = await buildPortalContext(Role.TEACHER);

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
      portalName="Teacher portal"
      portalBadge="Your assigned classes only"
      unreadNotifications={unreadNotifications}
      profileHref="/teacher/profile"
    >
      {children}
    </AppShell>
  );
}
