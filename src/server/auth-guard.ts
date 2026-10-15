import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { forbidden, notFound, unauthenticated } from '@/lib/errors';
import { hasPermission, type Permission } from '@/lib/rbac';
import { Role } from '@prisma/client';

export interface Actor {
  id: string;
  email: string;
  name: string;
  role: Role;
  campusId: string | null;
  locale: string;
  permissions: Set<string>;
  teacherProfileId: string | null;
  studentId: string | null;
}

/** Resolve the signed-in actor, or null. Never trusts client-supplied identity. */
export async function getActor(): Promise<Actor | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    campusId: user.campusId ?? null,
    locale: user.locale ?? 'en',
    permissions: new Set(user.permissions ?? []),
    teacherProfileId: user.teacherProfileId ?? null,
    studentId: user.studentId ?? null,
  };
}

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw unauthenticated();
  return actor;
}

export async function requirePermission(...required: Permission[]): Promise<Actor> {
  const actor = await requireActor();
  const allowed = required.some((p) => hasPermission(actor.permissions, p));
  if (!allowed) {
    throw forbidden(
      'Your role does not include access to this feature. Contact an administrator if you need it.',
    );
  }
  return actor;
}

export async function requireRole(...roles: Role[]): Promise<Actor> {
  const actor = await requireActor();
  if (!roles.includes(actor.role)) throw forbidden();
  return actor;
}

export function isAdmin(actor: Actor): boolean {
  return actor.role === Role.ADMIN;
}

// ---------------------------------------------------------------------------
// Scope resolution
//
// Scope is the set of records a non-administrative user may touch. It is
// always derived from the database, never from request parameters.
// ---------------------------------------------------------------------------

export interface TeacherScope {
  teacherProfileId: string;
  classSectionIds: string[];
  subjectIds: string[];
}

/**
 * Class sections and subjects a teacher may act on: those they teach per the
 * timetable, plus any class where they are the assigned class teacher.
 */
export async function getTeacherScope(actor: Actor): Promise<TeacherScope> {
  if (!actor.teacherProfileId) {
    return { teacherProfileId: '', classSectionIds: [], subjectIds: [] };
  }

  const [slots, teacherSubjects, classTeacherOf] = await Promise.all([
    prisma.timetableSlot.findMany({
      where: { teacherProfileId: actor.teacherProfileId },
      select: { classSectionId: true, subjectId: true },
    }),
    prisma.teacherSubject.findMany({
      where: { teacherProfileId: actor.teacherProfileId },
      select: { subjectId: true, classSectionId: true },
    }),
    prisma.classSection.findMany({
      where: { classTeacherId: actor.teacherProfileId },
      select: { id: true },
    }),
  ]);

  const classSectionIds = new Set<string>(classTeacherOf.map((c) => c.id));
  const subjectIds = new Set<string>();

  for (const slot of slots) {
    classSectionIds.add(slot.classSectionId);
    if (slot.subjectId) subjectIds.add(slot.subjectId);
  }
  for (const ts of teacherSubjects) {
    subjectIds.add(ts.subjectId);
    if (ts.classSectionId) classSectionIds.add(ts.classSectionId);
  }

  return {
    teacherProfileId: actor.teacherProfileId,
    classSectionIds: Array.from(classSectionIds),
    subjectIds: Array.from(subjectIds),
  };
}

/** Student ids the actor is allowed to read. */
export async function getVisibleStudentIds(actor: Actor): Promise<string[]> {
  if (isAdmin(actor)) {
    const all = await prisma.student.findMany({ select: { id: true } });
    return all.map((s) => s.id);
  }

  if (actor.role === Role.TEACHER) {
    const scope = await getTeacherScope(actor);
    if (scope.classSectionIds.length === 0) return [];

    const enrollments = await prisma.enrollment.findMany({
      where: {
        classSectionId: { in: scope.classSectionIds },
        status: 'ACTIVE',
      },
      select: { studentId: true },
    });
    return Array.from(new Set(enrollments.map((e) => e.studentId)));
  }

  if (actor.role === Role.STUDENT) {
    return actor.studentId ? [actor.studentId] : [];
  }

  if (actor.role === Role.PARENT) {
    const links = await prisma.guardianLink.findMany({
      where: { guardianUserId: actor.id, isAuthorized: true },
      select: { studentId: true },
    });
    return links.map((l) => l.studentId);
  }

  return [];
}

/**
 * Students visible to a parent, with the per-child permissions that parent
 * holds. A guardian may be authorized for a child but denied fee visibility.
 */
export async function getGuardianChildren(actor: Actor) {
  if (actor.role !== Role.PARENT) return [];

  return prisma.guardianLink.findMany({
    where: { guardianUserId: actor.id, isAuthorized: true },
    include: {
      student: {
        include: {
          enrollments: {
            where: { status: 'ACTIVE' },
            include: {
              classSection: {
                include: { course: true, academicSession: true },
              },
            },
            take: 1,
          },
        },
      },
    },
    orderBy: [{ isPrimary: 'desc' }, { student: { firstName: 'asc' } }],
  });
}

export async function getGuardianLink(actor: Actor, studentId: string) {
  if (actor.role !== Role.PARENT) return null;
  return prisma.guardianLink.findUnique({
    where: {
      guardianUserId_studentId: { guardianUserId: actor.id, studentId },
    },
  });
}

// ---------------------------------------------------------------------------
// Assertions
//
// Call these before reading or mutating a scoped record. They throw, so a
// missed check cannot silently return another user's data.
// ---------------------------------------------------------------------------

export async function assertStudentAccess(
  actor: Actor,
  studentId: string,
  options: { forFee?: boolean; forResult?: boolean } = {},
): Promise<void> {
  if (isAdmin(actor)) return;

  if (actor.role === Role.STUDENT) {
    if (actor.studentId !== studentId) throw forbidden('You can only view your own records.');
    return;
  }

  if (actor.role === Role.PARENT) {
    const link = await getGuardianLink(actor, studentId);
    if (!link) throw forbidden('This student is not linked to your account.');
    if (options.forFee && !link.canViewFees) {
      throw forbidden('Fee information is not shared with your account.');
    }
    if (options.forResult && !link.canViewResults) {
      throw forbidden('Result information is not shared with your account.');
    }
    return;
  }

  if (actor.role === Role.TEACHER) {
    const scope = await getTeacherScope(actor);
    if (scope.classSectionIds.length === 0) throw forbidden();

    const enrollment = await prisma.enrollment.findFirst({
      where: {
        studentId,
        classSectionId: { in: scope.classSectionIds },
      },
      select: { id: true },
    });

    if (!enrollment) {
      throw forbidden('This student is not enrolled in any class you teach.');
    }

    if (options.forFee) {
      throw forbidden('Teachers do not have access to fee records.');
    }
    return;
  }

  throw forbidden();
}

export async function assertClassSectionAccess(
  actor: Actor,
  classSectionId: string,
): Promise<void> {
  if (isAdmin(actor)) return;

  if (actor.role === Role.TEACHER) {
    const scope = await getTeacherScope(actor);
    if (!scope.classSectionIds.includes(classSectionId)) {
      throw forbidden('You are not assigned to this class.');
    }
    return;
  }

  if (actor.role === Role.STUDENT) {
    const enrolled = await prisma.enrollment.findFirst({
      where: { studentId: actor.studentId ?? '__none__', classSectionId },
      select: { id: true },
    });
    if (!enrolled) throw forbidden();
    return;
  }

  if (actor.role === Role.PARENT) {
    const link = await prisma.guardianLink.findFirst({
      where: {
        guardianUserId: actor.id,
        isAuthorized: true,
        student: { enrollments: { some: { classSectionId } } },
      },
      select: { id: true },
    });
    if (!link) throw forbidden();
    return;
  }

  throw forbidden();
}

/** Restrict a query to a class section the teacher owns, throwing otherwise. */
export async function assertSubjectAccess(
  actor: Actor,
  subjectId: string,
  classSectionId?: string,
): Promise<void> {
  if (isAdmin(actor)) return;

  if (actor.role !== Role.TEACHER) throw forbidden();

  const scope = await getTeacherScope(actor);
  if (!scope.subjectIds.includes(subjectId)) {
    throw forbidden('You are not assigned to teach this subject.');
  }
  if (classSectionId && !scope.classSectionIds.includes(classSectionId)) {
    throw forbidden('You are not assigned to this class.');
  }
}

/**
 * Build a Prisma `where` fragment limiting students to the actor's scope.
 * Use this for list endpoints so filtering happens in the database.
 */
export async function studentScopeFilter(actor: Actor) {
  if (isAdmin(actor)) return {};

  if (actor.role === Role.STUDENT) {
    return { id: actor.studentId ?? '__none__' };
  }

  if (actor.role === Role.PARENT) {
    const links = await prisma.guardianLink.findMany({
      where: { guardianUserId: actor.id, isAuthorized: true },
      select: { studentId: true },
    });
    return { id: { in: links.map((l) => l.studentId) } };
  }

  if (actor.role === Role.TEACHER) {
    const scope = await getTeacherScope(actor);
    return {
      enrollments: {
        some: { classSectionId: { in: scope.classSectionIds } },
      },
    };
  }

  return { id: '__none__' };
}

/** Load a student only if the actor may see it; otherwise throw NOT_FOUND. */
export async function loadStudentForActor(actor: Actor, studentId: string) {
  await assertStudentAccess(actor, studentId);

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      guardians: { include: { guardianUser: { select: { id: true, name: true, email: true, phone: true } } } },
      enrollments: {
        where: { status: 'ACTIVE' },
        include: {
          classSection: { include: { course: true, academicSession: true } },
          batch: true,
        },
      },
    },
  });

  if (!student) throw notFound('Student not found.');
  return student;
}
