import { z } from 'zod';
import { NextResponse } from 'next/server';
import { fail, guard, limit, body, parseListQuery, listResponse } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { writeAudit } from '@/lib/audit';
import { conflict, notFound, validationError } from '@/lib/errors';
import { PermissionAction, Prisma, Role, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PERMISSIONS as ALL_PERMISSIONS } from '@/lib/rbac';

/**
 * User account administration.
 *
 * Only an administrator reaches these handlers. Role changes and suspensions
 * invalidate existing sessions in the same transaction, so a demoted or
 * suspended user cannot keep using an already-issued session cookie.
 */
export async function GET(request: Request) {
  try {
    await guard(PERMISSIONS.USER_VIEW);
    const query = parseListQuery(request);
    const scope = query.params.get('scope') ?? 'list';

    if (scope === 'permissions') {
      // The catalog the grant editor renders, grouped by area.
      const catalog = Object.entries(ALL_PERMISSIONS).map(([key, value]) => ({
        key,
        value,
        area: value.split(':')[0],
      }));

      const grants = await prisma.permissionGrant.findMany({
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true,
          userId: true,
          action: true,
          resource: true,
          scopeType: true,
          scopeId: true,
          expiresAt: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      });

      return NextResponse.json({ data: { catalog, grants } });
    }

    const where: Prisma.UserWhereInput = {
      ...(query.params.get('role') ? { role: query.params.get('role') as Role } : {}),
      ...(query.params.get('status') ? { status: query.params.get('status') as UserStatus } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [rows, total, byRole] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
        skip: query.skip,
        take: query.take,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          mfaEnabled: true,
          lastLoginAt: true,
          failedLogins: true,
          lockedUntil: true,
          createdAt: true,
          _count: { select: { sessions: true, permissionGrants: true } },
        },
      }),
      prisma.user.count({ where }),
      prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    ]);

    return listResponse(
      rows,
      total,
      Object.assign(query, {
        roleCounts: Object.fromEntries(byRole.map((r) => [r.role, r._count._all])),
      }) as typeof query,
    );
  } catch (error) {
    return fail(error, 'users GET');
  }
}

/** Create an administrative or support account. */
export async function POST(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.USER_MANAGE);
    await limit(request, 'users:create', 20, 60);

    const payload = await body(
      request,
      z.object({
        name: z.string().trim().min(2).max(120),
        email: z.string().trim().email(),
        phone: z.string().trim().max(30).optional().nullable(),
        role: z.enum(['ADMIN', 'TEACHER', 'STUDENT', 'PARENT']),
        password: z.string().min(8, 'Use at least 8 characters.').max(128),
        status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION']).default('ACTIVE'),
      }),
    );

    const email = payload.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw conflict(`An account already exists for ${email}.`);

    // Creating a teacher or student login here would leave the account without
    // the profile row the portal depends on, so those go through their own flow.
    if (payload.role === 'TEACHER' || payload.role === 'STUDENT') {
      throw validationError(
        `Create ${payload.role.toLowerCase()} accounts from the Teachers or Students screen so the required profile is created too.`,
      );
    }

    const created = await prisma.user.create({
      data: {
        email,
        name: payload.name,
        phone: payload.phone ?? null,
        role: payload.role as Role,
        status: payload.status as UserStatus,
        passwordHash: await bcrypt.hash(payload.password, 12),
      },
      select: { id: true, name: true, email: true, role: true, status: true },
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'user.create',
      entity: 'User',
      entityId: created.id,
      after: { email: created.email, role: created.role },
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    return fail(error, 'users POST');
  }
}

/** Change status, role, password, or grant/revoke a permission. */
export async function PUT(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.USER_MANAGE);
    await limit(request, 'users:update', 60, 60);

    const payload = await body(
      request,
      z.discriminatedUnion('action', [
        z.object({
          action: z.literal('setStatus'),
          userId: z.string().min(1),
          status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION']),
          reason: z.string().trim().max(300).optional(),
        }),
        z.object({
          action: z.literal('setRole'),
          userId: z.string().min(1),
          role: z.enum(['ADMIN', 'TEACHER', 'STUDENT', 'PARENT']),
        }),
        z.object({
          action: z.literal('resetPassword'),
          userId: z.string().min(1),
          newPassword: z.string().min(8).max(128),
        }),
        z.object({
          action: z.literal('unlock'),
          userId: z.string().min(1),
        }),
        z.object({
          action: z.literal('grant'),
          userId: z.string().min(1),
          permission: z.string().trim().min(3).max(60),
          scopeType: z.string().trim().max(40).optional().nullable(),
          scopeId: z.string().trim().max(60).optional().nullable(),
          reason: z.string().trim().max(300).optional(),
          expiresAt: z.coerce.date().optional().nullable(),
        }),
        z.object({
          action: z.literal('revoke'),
          grantId: z.string().min(1),
        }),
      ]),
    );

    if (payload.action === 'setStatus') {
      if (payload.userId === actor.id && payload.status !== 'ACTIVE') {
        throw conflict('You cannot deactivate your own account.');
      }

      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, status: true, role: true, email: true },
      });
      if (!user) throw notFound('User not found.');

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: payload.userId },
          data: {
            status: payload.status as UserStatus,
            // A suspension must clear the login lockout counters, otherwise a
            // later reactivation would inherit a stale lock.
            ...(payload.status === 'ACTIVE'
              ? { failedLogins: 0, lockedUntil: null }
              : {}),
          },
        });

        if (payload.status !== 'ACTIVE') {
          await tx.session.deleteMany({ where: { userId: payload.userId } });
        }
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'user.set_status',
        entity: 'User',
        entityId: payload.userId,
        before: { status: user.status },
        after: { status: payload.status, reason: payload.reason ?? null },
      });

      return NextResponse.json({ data: { userId: payload.userId, status: payload.status } });
    }

    if (payload.action === 'setRole') {
      if (payload.userId === actor.id) {
        throw conflict('You cannot change your own role.');
      }

      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, role: true, email: true, teacherProfile: { select: { id: true } }, studentProfile: { select: { id: true } } },
      });
      if (!user) throw notFound('User not found.');

      if (payload.role === 'TEACHER' && !user.teacherProfile) {
        throw conflict('This account has no teacher profile, so it cannot take the teacher role.');
      }
      if (payload.role === 'STUDENT' && !user.studentProfile) {
        throw conflict('This account has no student profile, so it cannot take the student role.');
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id: payload.userId },
          data: { role: payload.role as Role },
        }),
        prisma.session.deleteMany({ where: { userId: payload.userId } }),
      ]);

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'user.set_role',
        entity: 'User',
        entityId: payload.userId,
        before: { role: user.role },
        after: { role: payload.role },
      });

      return NextResponse.json({ data: { userId: payload.userId, role: payload.role } });
    }

    if (payload.action === 'resetPassword') {
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true },
      });
      if (!user) throw notFound('User not found.');

      await prisma.$transaction([
        prisma.user.update({
          where: { id: payload.userId },
          data: {
            passwordHash: await bcrypt.hash(payload.newPassword, 12),
            failedLogins: 0,
            lockedUntil: null,
          },
        }),
        prisma.session.deleteMany({ where: { userId: payload.userId } }),
      ]);

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'user.reset_password',
        entity: 'User',
        entityId: payload.userId,
      });

      return NextResponse.json({ data: { reset: true } });
    }

    if (payload.action === 'unlock') {
      await prisma.user.update({
        where: { id: payload.userId },
        data: { failedLogins: 0, lockedUntil: null },
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'user.unlock',
        entity: 'User',
        entityId: payload.userId,
      });

      return NextResponse.json({ data: { unlocked: true } });
    }

    if (payload.action === 'grant') {
      const valid = Object.values(ALL_PERMISSIONS) as string[];
      if (!valid.includes(payload.permission)) {
        throw validationError(`"${payload.permission}" is not a known permission.`);
      }

      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, role: true },
      });
      if (!user) throw notFound('User not found.');

      // A grant is stored as resource + action so it maps onto the same
      // "resource:action" key the role defaults use.
      const [resource, action] = payload.permission.split(':') as [string, string];
      const actionEnum = action.toUpperCase() as PermissionAction;

      const grant = await prisma.permissionGrant.upsert({
        where: {
          userId_action_resource_scopeType_scopeId: {
            userId: payload.userId,
            action: actionEnum,
            resource,
            scopeType: payload.scopeType ?? '',
            scopeId: payload.scopeId ?? '',
          },
        },
        create: {
          userId: payload.userId,
          action: actionEnum,
          resource,
          scopeType: payload.scopeType ?? '',
          scopeId: payload.scopeId ?? '',
          grantedBy: actor.id,
          expiresAt: payload.expiresAt ?? null,
        },
        update: {
          grantedBy: actor.id,
          expiresAt: payload.expiresAt ?? null,
        },
        select: { id: true, action: true, resource: true, expiresAt: true },
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'user.grant_permission',
        entity: 'PermissionGrant',
        entityId: grant.id,
        after: {
          userId: payload.userId,
          permission: payload.permission,
          reason: payload.reason ?? null,
          expiresAt: payload.expiresAt ?? null,
        },
      });

      return NextResponse.json({ data: grant }, { status: 201 });
    }

    const grant = await prisma.permissionGrant.findUnique({
      where: { id: payload.grantId },
      select: { id: true, userId: true, action: true, resource: true },
    });
    if (!grant) throw notFound('Permission grant not found.');

    await prisma.permissionGrant.delete({ where: { id: payload.grantId } });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'user.revoke_permission',
      entity: 'PermissionGrant',
      entityId: payload.grantId,
      before: {
        userId: grant.userId,
        permission: `${grant.resource}:${grant.action}`,
      },
    });

    return NextResponse.json({ data: { revoked: true } });
  } catch (error) {
    return fail(error, 'users PUT');
  }
}
