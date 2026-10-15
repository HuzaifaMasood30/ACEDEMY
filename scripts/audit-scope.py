"""Audit every admin API route for endpoints a non-admin can reach without scoping.

A route is flagged when it guards with a permission that teachers, students or
parents hold, but never calls a scoping helper in the same file. Those are the
endpoints where a portal role may be able to read academy-wide data.
"""
import os
import re

ROOT = 'src/app/api/admin'

# Permissions held by at least one non-admin role (see src/lib/rbac.ts).
NON_ADMIN_PERMS = {
    'STUDENT_VIEW', 'GUARDIAN_VIEW', 'ATTENDANCE_VIEW', 'MARKS_VIEW',
    'ASSIGNMENT_VIEW', 'RESOURCE_VIEW', 'EXAM_VIEW', 'ANNOUNCEMENT_VIEW',
    'PROGRESS_VIEW', 'INVOICE_VIEW', 'PAYMENT_VIEW', 'FEE_STRUCTURE_VIEW',
    'TIMETABLE_VIEW', 'COURSE_VIEW', 'CLASS_VIEW', 'SUBJECT_VIEW',
    'REPORT_VIEW', 'ACADEMY_VIEW', 'SESSION_VIEW', 'ENROLLMENT_VIEW',
}

# Any of these appearing in a file means the author thought about scope.
SCOPE_MARKERS = (
    'studentScopeFilter', 'assertStudentAccess', 'getTeacherScope',
    'assertClassSectionAccess', 'assertSubjectAccess', 'guardianLink',
    'isAdmin(', 'actor.role', 'actor.studentId',
)

flagged = []
for dirpath, _dirnames, filenames in os.walk(ROOT):
    for name in filenames:
        if name != 'route.ts':
            continue
        path = os.path.join(dirpath, name)
        src = open(path).read()
        guards = set(re.findall(r'guard\(PERMISSIONS\.([A-Z_]+)', src))
        reachable = guards & NON_ADMIN_PERMS
        if not reachable:
            continue
        scoped = any(marker in src for marker in SCOPE_MARKERS)
        if not scoped:
            flagged.append((path, sorted(reachable)))

print(f'{len(flagged)} route(s) reachable by a non-admin role with no scoping:\n')
for path, perms in sorted(flagged):
    print(f'  {path}')
    print(f'      guards: {", ".join(perms)}')
