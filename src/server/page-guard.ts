import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getActor, type Actor } from './auth-guard';
import { hasPermission, homeForRole, type Permission } from '@/lib/rbac';
import { NAVIGATION, type NavSection } from '@/lib/navigation';
import { Role } from '@prisma/client';

/**
 * Page-level guards.
 *
 * Server components cannot throw a 403 the way an API route can, so these
 * redirect instead. They deliberately re-resolve the actor from the database
 * rather than trusting the session token, which means a revoked account or a
 * removed permission takes effect on the very next request.
 */

export interface PortalContext {
  actor: Actor;
  sections: NavSection[];
  unreadNotifications: number;
}

/** Require any signed-in user, optionally constrained to a set of roles. */
export async function requirePageActor(...roles: Role[]): Promise<Actor> {
  const actor = await getActor();

  if (!actor) redirect('/login');

  if (roles.length > 0 && !roles.includes(actor.role)) {
    redirect(homeForRole(actor.role));
  }

  return actor;
}

/** Require a specific capability. Redirects to the actor's own portal. */
export async function requirePagePermission(permission: Permission): Promise<Actor> {
  const actor = await requirePageActor();

  if (!hasPermission(actor.permissions, permission)) {
    redirect(homeForRole(actor.role));
  }

  return actor;
}

/**
 * Resolve everything a portal shell needs: the actor, their visible navigation
 * and their unread notification count.
 */
export async function buildPortalContext(role: Role): Promise<PortalContext> {
  const actor = await requirePageActor(role);

  const sections = NAVIGATION[role] ?? [];

  const unreadNotifications = await prisma.notificationJob
    .count({
      where: {
        recipientUserId: actor.id,
        status: { in: ['SENT', 'DELIVERED'] },
        readAt: null,
      },
    })
    .catch(() => 0);

  return { actor, sections, unreadNotifications };
}

/** Redirect a signed-in user from a portal root to their own home. */
export async function redirectToOwnPortal(): Promise<never> {
  const actor = await getActor();
  redirect(actor ? homeForRole(actor.role) : '/login');
}
