import { NextResponse } from 'next/server';
import { fail, guard, ok } from '@/server/api-helpers';
import { PERMISSIONS } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { Role } from '@prisma/client';
import { getTeacherScope } from '@/server/auth-guard';

/**
 * Everything a portal page needs to know about "who am I acting for".
 *
 * A student resolves to their own record; a guardian resolves to the children
 * they are linked to, together with the per-link visibility flags, so the UI can
 * hide a fee panel the guardian is not authorised to see rather than showing an
 * error. Teachers receive the classes they are assigned to.
 */
export async function GET() {
  try {
    const actor = await guard(PERMISSIONS.ACADEMY_VIEW);

    if (actor.role === Role.STUDENT) {
      if (!actor.studentId) {
        return NextResponse.json(ok({ students: [], scope: 'student', studentId: null }));
      }

      const student = await prisma.student.findUnique({
        where: { id: actor.studentId },
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          lastName: true,
          status: true,
          photoUrl: true,
          dateOfBirth: true,
          enrollments: {
            where: { status: 'ACTIVE' },
            select: {
              classSection: {
                select: {
                  id: true,
                  name: true,
                  course: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      });

      return NextResponse.json(
        ok({
          students: student ? [student] : [],
          scope: 'student',
          studentId: actor.studentId,
        }),
      );
    }

    if (actor.role === Role.PARENT) {
      const links = await prisma.guardianLink.findMany({
        where: { guardianUserId: actor.id },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        select: {
          relation: true,
          isPrimary: true,
          isAuthorized: true,
          canViewFees: true,
          canViewResults: true,
          receivesNotifications: true,
          student: {
            select: {
              id: true,
              admissionNo: true,
              firstName: true,
              lastName: true,
              status: true,
              photoUrl: true,
              dateOfBirth: true,
              enrollments: {
                where: { status: 'ACTIVE' },
                select: {
                  classSection: {
                    select: {
                      id: true,
                      name: true,
                      course: { select: { id: true, name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });

      // A guardian without authorisation must not see the child at all.
      const visible = links.filter((link) => link.isAuthorized);

      return NextResponse.json(
        ok({
          students: visible.map((link) => ({
            ...link.student,
            link: {
              relation: link.relation,
              isPrimary: link.isPrimary,
              canViewFees: link.canViewFees,
              canViewResults: link.canViewResults,
              receivesNotifications: link.receivesNotifications,
            },
          })),
          scope: 'parent',
          studentId: visible[0]?.student.id ?? null,
        }),
      );
    }

    if (actor.role === Role.TEACHER) {
      if (!actor.teacherProfileId) {
        return NextResponse.json(ok({ classes: [], scope: 'teacher', studentId: null }));
      }

      const scope = await getTeacherScope(actor);

      // TeacherSubject carries only ids, so the classes and subjects are
      // resolved in one pass and paired back up below.
      const [classSections, teacherSubjects] = await Promise.all([
        prisma.classSection.findMany({
          where: { id: { in: scope.classSectionIds }, isActive: true },
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            capacity: true,
            course: { select: { id: true, name: true } },
            _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
          },
        }),
        prisma.teacherSubject.findMany({
          where: { teacherProfileId: actor.teacherProfileId },
          select: { classSectionId: true, subject: { select: { id: true, name: true, code: true } } },
        }),
      ]);

      // Pair every class with the subjects this teacher covers in it, so the UI
      // can offer a subject filter without a second round trip.
      const classes = classSections.map((classSection) => ({
        classSection,
        subjects: teacherSubjects
          .filter((entry) => entry.classSectionId === classSection.id)
          .map((entry) => entry.subject),
      }));

      return NextResponse.json(ok({ classes, scope: 'teacher', studentId: null }));
    }

    return NextResponse.json(ok({ scope: 'admin', studentId: null }));
  } catch (error) {
    return fail(error, 'portal context GET');
  }
}
