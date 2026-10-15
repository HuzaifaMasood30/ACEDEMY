import { z } from 'zod';
import { NextResponse } from 'next/server';
import { fail, guard, limit, body, parseListQuery, listResponse } from '@/server/api-helpers';
import { PERMISSIONS, hasPermission } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { writeAudit } from '@/lib/audit';
import { conflict, forbidden, notFound } from '@/lib/errors';
import { GuardianRelation, Prisma, Role, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

/**
 * Parents and guardian links.
 *
 * A guardian account is separate from the student account and only ever reaches
 * the children explicitly linked to it. Each link carries its own visibility
 * flags, so one guardian can be shown results but not fees.
 */
export async function GET(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.GUARDIAN_VIEW);
    const query = parseListQuery(request);
    const scope = query.params.get('scope') ?? 'list';

    // Guardians hold GUARDIAN_VIEW so the parent portal can render their own
    // contact details. Staff management of the guardian directory requires the
    // administrative permission, so anything else is limited to self.
    const staffView = hasPermission(actor.permissions, PERMISSIONS.GUARDIAN_MANAGE);
    const selfOnly = !staffView;

    if (scope === 'detail') {
      const id = query.params.get('id');
      if (!id) {
        return NextResponse.json(
          { error: { code: 'VALIDATION', message: 'A guardian is required.' } },
          { status: 422 },
        );
      }

      if (selfOnly && id !== actor.id) {
        throw forbidden('You can only view your own guardian record.');
      }

      const guardian = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          createdAt: true,
          lastLoginAt: true,
          guardianLinks: {
            select: {
              id: true,
              relation: true,
              isPrimary: true,
              isAuthorized: true,
              canViewFees: true,
              canViewResults: true,
              receivesNotifications: true,
              contactPhone: true,
              occupation: true,
              student: {
                select: {
                  id: true,
                  admissionNo: true,
                  firstName: true,
                  lastName: true,
                  status: true,
                  photoUrl: true,
                  enrollments: {
                    where: { status: 'ACTIVE' },
                    take: 1,
                    select: { classSection: { select: { id: true, name: true } } },
                  },
                },
              },
            },
          },
        },
      });

      if (!guardian || guardian.guardianLinks.length === 0) {
        throw notFound('Guardian not found.');
      }

      return NextResponse.json({ data: guardian });
    }

    const where: Prisma.UserWhereInput = {
      role: Role.PARENT,
      ...(selfOnly ? { id: actor.id } : {}),
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

    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: query.skip,
        take: query.take,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
          guardianLinks: {
            select: {
              id: true,
              relation: true,
              isPrimary: true,
              isAuthorized: true,
              canViewFees: true,
              canViewResults: true,
              student: {
                select: {
                  id: true,
                  admissionNo: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return listResponse(rows, total, query);
  } catch (error) {
    return fail(error, 'parents GET');
  }
}

/** Create a guardian account, or link an existing guardian to a student. */
export async function POST(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.GUARDIAN_MANAGE);
    await limit(request, 'parents:write', 40, 60);

    const payload = await body(
      request,
      z.discriminatedUnion('action', [
        z.object({
          action: z.literal('create'),
          name: z.string().trim().min(2).max(120),
          email: z.string().trim().email(),
          phone: z.string().trim().max(30).optional().nullable(),
          initialPassword: z.string().min(8).max(128).optional().nullable(),
        }),
        z.object({
          action: z.literal('link'),
          guardianUserId: z.string().min(1),
          studentId: z.string().min(1),
          relation: z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER']),
          isPrimary: z.boolean().default(false),
          canViewFees: z.boolean().default(true),
          canViewResults: z.boolean().default(true),
          receivesNotifications: z.boolean().default(true),
          contactPhone: z.string().trim().max(30).optional().nullable(),
          occupation: z.string().trim().max(80).optional().nullable(),
        }),
      ]),
    );

    if (payload.action === 'create') {
      const email = payload.email.toLowerCase();
      const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (existing) throw conflict(`An account already exists for ${email}.`);

      const created = await prisma.user.create({
        data: {
          email,
          name: payload.name,
          phone: payload.phone ?? null,
          role: Role.PARENT,
          status: UserStatus.ACTIVE,
          passwordHash: await bcrypt.hash(
            payload.initialPassword ?? `Par-${Math.random().toString(36).slice(2, 10)}`,
            12,
          ),
        },
        select: { id: true, name: true, email: true },
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'guardian.create',
        entity: 'User',
        entityId: created.id,
        after: { email: created.email },
      });

      return NextResponse.json({ data: created }, { status: 201 });
    }

    const [guardian, student] = await Promise.all([
      prisma.user.findUnique({
        where: { id: payload.guardianUserId },
        select: { id: true, role: true, name: true },
      }),
      prisma.student.findUnique({
        where: { id: payload.studentId },
        select: { id: true, admissionNo: true },
      }),
    ]);

    if (!guardian) throw notFound('Guardian account not found.');
    if (guardian.role !== Role.PARENT) {
      throw conflict('Only a parent account can be linked to a student.');
    }
    if (!student) throw notFound('Student not found.');

    const duplicate = await prisma.guardianLink.findUnique({
      where: {
        guardianUserId_studentId: {
          guardianUserId: payload.guardianUserId,
          studentId: payload.studentId,
        },
      },
      select: { id: true },
    });

    if (duplicate) throw conflict('This guardian is already linked to this student.');

    const link = await prisma.guardianLink.create({
      data: {
        guardianUserId: payload.guardianUserId,
        studentId: payload.studentId,
        relation: payload.relation as GuardianRelation,
        isPrimary: payload.isPrimary,
        canViewFees: payload.canViewFees,
        canViewResults: payload.canViewResults,
        receivesNotifications: payload.receivesNotifications,
        contactPhone: payload.contactPhone ?? null,
        occupation: payload.occupation ?? null,
      },
      select: { id: true },
    });

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'guardian.link',
      entity: 'GuardianLink',
      entityId: link.id,
      after: {
        guardianUserId: payload.guardianUserId,
        studentId: payload.studentId,
        relation: payload.relation,
        canViewFees: payload.canViewFees,
        canViewResults: payload.canViewResults,
      },
    });

    return NextResponse.json({ data: link }, { status: 201 });
  } catch (error) {
    return fail(error, 'parents POST');
  }
}

/** Change link permissions, or revoke a link entirely. */
export async function PUT(request: Request) {
  try {
    const actor = await guard(PERMISSIONS.GUARDIAN_MANAGE);
    await limit(request, 'parents:update', 60, 60);

    const payload = await body(
      request,
      z.discriminatedUnion('action', [
        z.object({
          action: z.literal('updateLink'),
          linkId: z.string().min(1),
          values: z
            .object({
              relation: z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER']).optional(),
              isPrimary: z.boolean().optional(),
              isAuthorized: z.boolean().optional(),
              canViewFees: z.boolean().optional(),
              canViewResults: z.boolean().optional(),
              receivesNotifications: z.boolean().optional(),
              contactPhone: z.string().trim().max(30).optional().nullable(),
              occupation: z.string().trim().max(80).optional().nullable(),
            })
            .strict(),
        }),
        z.object({
          action: z.literal('unlink'),
          linkId: z.string().min(1),
        }),
      ]),
    );

    if (payload.action === 'updateLink') {
      const before = await prisma.guardianLink.findUnique({
        where: { id: payload.linkId },
        select: {
          id: true,
          canViewFees: true,
          canViewResults: true,
          isAuthorized: true,
        },
      });
      if (!before) throw notFound('Guardian link not found.');

      const updated = await prisma.guardianLink.update({
        where: { id: payload.linkId },
        data: payload.values,
        select: {
          id: true,
          relation: true,
          isPrimary: true,
          isAuthorized: true,
          canViewFees: true,
          canViewResults: true,
          receivesNotifications: true,
        },
      });

      await writeAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'guardian.update_link',
        entity: 'GuardianLink',
        entityId: payload.linkId,
        before,
        after: payload.values,
      });

      return NextResponse.json({ data: updated });
    }

    const link = await prisma.guardianLink.findUnique({
      where: { id: payload.linkId },
      select: { id: true, guardianUserId: true, studentId: true },
    });
    if (!link) throw notFound('Guardian link not found.');

    await prisma.guardianLink.delete({ where: { id: payload.linkId } });

    // A guardian with no remaining children cannot use the portal, so the
    // account is deactivated rather than left signed-in with an empty portal.
    const remaining = await prisma.guardianLink.count({
      where: { guardianUserId: link.guardianUserId },
    });

    if (remaining === 0) {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: link.guardianUserId },
          data: { status: UserStatus.SUSPENDED },
        }),
        prisma.session.deleteMany({ where: { userId: link.guardianUserId } }),
      ]);
    }

    await writeAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'guardian.unlink',
      entity: 'GuardianLink',
      entityId: payload.linkId,
      after: { remainingLinks: remaining, accountSuspended: remaining === 0 },
    });

    return NextResponse.json({
      data: { removed: true, guardianDeactivated: remaining === 0 },
    });
  } catch (error) {
    return fail(error, 'parents PUT');
  }
}
