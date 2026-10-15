import { z } from 'zod';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { fail, limit, body } from '@/server/api-helpers';
import { prisma } from '@/lib/prisma';
import { writeAudit } from '@/lib/audit';
import { requireActor } from '@/server/auth-guard';
import { validationError } from '@/lib/errors';

/**
 * Self-service account endpoints.
 *
 * Every authenticated role uses these for their own profile. There is no way to
 * address another user's account: the actor id always comes from the session,
 * never from the request body or query.
 */

const PROFILE_SELECT = {
  id: true,
  email: true,
  phone: true,
  name: true,
  role: true,
  status: true,
  avatarUrl: true,
  locale: true,
  themePref: true,
  emailVerified: true,
  phoneVerified: true,
  mfaEnabled: true,
  lastLoginAt: true,
  createdAt: true,
  teacherProfile: { select: { id: true, designation: true, employeeCode: true } },
  studentProfile: {
    select: { id: true, admissionNo: true, firstName: true, lastName: true, rollNo: true },
  },
} as const;

export async function GET() {
  try {
    const actor = await requireActor();

    const user = await prisma.user.findUnique({
      where: { id: actor.id },
      select: PROFILE_SELECT,
    });

    if (!user) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Account not found.' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: user });
  } catch (error) {
    return fail(error, 'account GET');
  }
}

/**
 * Update the signed-in user's own profile, or change their password.
 *
 * Role, status and permission grants are deliberately not writable here; those
 * remain administrator actions.
 */
export async function PUT(request: Request) {
  try {
    const actor = await requireActor();
    await limit(request, 'account:update', 20, 60);

    const payload = await body(
      request,
      z.discriminatedUnion('action', [
        z.object({
          action: z.literal('profile'),
          name: z.string().trim().min(2).max(120).optional(),
          phone: z.string().trim().max(30).optional().nullable(),
          locale: z.string().trim().max(10).optional(),
          themePref: z.enum(['light', 'dark', 'system']).optional(),
        }),
        z.object({
          action: z.literal('password'),
          currentPassword: z.string().min(1, 'Enter your current password.'),
          newPassword: z
            .string()
            .min(8, 'Use at least 8 characters.')
            .max(128)
            .regex(/[A-Za-z]/, 'Include at least one letter.')
            .regex(/\d/, 'Include at least one number.'),
        }),
      ]),
    );

    if (payload.action === 'profile') {
      const user = await prisma.user.update({
        where: { id: actor.id },
        data: {
          ...(payload.name !== undefined ? { name: payload.name } : {}),
          ...(payload.phone !== undefined ? { phone: payload.phone || null } : {}),
          ...(payload.locale !== undefined ? { locale: payload.locale } : {}),
          ...(payload.themePref !== undefined ? { themePref: payload.themePref } : {}),
        },
        select: PROFILE_SELECT,
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'account.profile_update',
        entity: 'User',
        entityId: actor.id,
        after: {
          name: payload.name ?? null,
          phone: payload.phone ?? null,
          locale: payload.locale ?? null,
          themePref: payload.themePref ?? null,
        },
      });

      return NextResponse.json({ data: user });
    }

    const user = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Account not found.' } },
        { status: 404 },
      );
    }

    const matches = await bcrypt.compare(payload.currentPassword, user.passwordHash);
    if (!matches) throw validationError('Your current password is incorrect.');

    if (payload.currentPassword === payload.newPassword) {
      throw validationError('Choose a password different from the current one.');
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: actor.id },
        data: { passwordHash: await bcrypt.hash(payload.newPassword, 12) },
      });

      // Changing a password must invalidate every existing session, including
      // any an attacker may already hold.
      await tx.session.deleteMany({ where: { userId: actor.id } });
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'account.password_change',
      entity: 'User',
      entityId: actor.id,
    });

    return NextResponse.json({ data: { changed: true, sessionsRevoked: true } });
  } catch (error) {
    return fail(error, 'account PUT');
  }
}
