import { Role } from '@prisma/client';

/**
 * Capability catalogue.
 *
 * A permission is `resource:action`. Roles map to the permissions they hold by
 * default; `PermissionGrant` rows can widen that set for one user. Every check
 * happens on the server — a hidden button is a convenience, never a control.
 */
export const PERMISSIONS = {
  // Academy-wide administration
  ACADEMY_VIEW: 'academy:view',
  ACADEMY_MANAGE: 'academy:manage',
  SETTINGS_VIEW: 'settings:view',
  SETTINGS_MANAGE: 'settings:manage',
  AUDIT_VIEW: 'audit:view',
  SYSTEM_BACKUP: 'system:backup',

  // People
  STUDENT_VIEW: 'student:view',
  STUDENT_VIEW_ALL: 'student:view_all',
  STUDENT_CREATE: 'student:create',
  STUDENT_UPDATE: 'student:update',
  STUDENT_DELETE: 'student:delete',
  STUDENT_APPROVE: 'student:approve',
  STUDENT_PROMOTE: 'student:promote',
  STUDENT_IMPORT: 'student:import',
  STUDENT_EXPORT: 'student:export',
  STUDENT_VIEW_PRIVATE: 'student:view_private',

  TEACHER_VIEW: 'teacher:view',
  TEACHER_CREATE: 'teacher:create',
  TEACHER_UPDATE: 'teacher:update',
  TEACHER_DELETE: 'teacher:delete',
  TEACHER_MANAGE_WORKLOAD: 'teacher:manage_workload',

  GUARDIAN_VIEW: 'guardian:view',
  GUARDIAN_MANAGE: 'guardian:manage',

  USER_VIEW: 'user:view',
  USER_MANAGE: 'user:manage',
  USER_SUSPEND: 'user:suspend',

  // Academic structure
  COURSE_VIEW: 'course:view',
  COURSE_MANAGE: 'course:manage',
  CLASS_VIEW: 'class:view',
  CLASS_MANAGE: 'class:manage',
  SUBJECT_VIEW: 'subject:view',
  SUBJECT_MANAGE: 'subject:manage',
  SESSION_VIEW: 'session:view',
  SESSION_MANAGE: 'session:manage',
  ENROLLMENT_VIEW: 'enrollment:view',
  ENROLLMENT_MANAGE: 'enrollment:manage',

  // Scheduling
  TIMETABLE_VIEW: 'timetable:view',
  TIMETABLE_MANAGE: 'timetable:manage',
  TIMETABLE_VIEW_ALL: 'timetable:view_all',

  // Attendance
  ATTENDANCE_VIEW: 'attendance:view',
  ATTENDANCE_VIEW_ALL: 'attendance:view_all',
  ATTENDANCE_MARK: 'attendance:mark',
  ATTENDANCE_EDIT: 'attendance:edit',
  ATTENDANCE_APPROVE: 'attendance:approve',
  ATTENDANCE_EXPORT: 'attendance:export',
  STAFF_ATTENDANCE_MANAGE: 'staff_attendance:manage',

  // Assignments & resources
  ASSIGNMENT_VIEW: 'assignment:view',
  ASSIGNMENT_CREATE: 'assignment:create',
  ASSIGNMENT_GRADE: 'assignment:grade',
  ASSIGNMENT_DELETE: 'assignment:delete',
  RESOURCE_VIEW: 'resource:view',
  RESOURCE_MANAGE: 'resource:manage',

  // Examinations & results
  EXAM_VIEW: 'exam:view',
  EXAM_VIEW_ALL: 'exam:view_all',
  EXAM_MANAGE: 'exam:manage',
  EXAM_SCHEDULE: 'exam:schedule',
  MARKS_VIEW: 'marks:view',
  MARKS_ENTER: 'marks:enter',
  MARKS_APPROVE: 'marks:approve',
  RESULT_PUBLISH: 'result:publish',
  RESULT_VIEW_ALL: 'result:view_all',
  RESULT_RECHECK_MANAGE: 'result:recheck_manage',
  GRADING_MANAGE: 'grading:manage',

  // Fees
  FEE_STRUCTURE_VIEW: 'fee_structure:view',
  FEE_STRUCTURE_MANAGE: 'fee_structure:manage',
  INVOICE_VIEW: 'invoice:view',
  INVOICE_VIEW_ALL: 'invoice:view_all',
  INVOICE_CREATE: 'invoice:create',
  INVOICE_UPDATE: 'invoice:update',
  INVOICE_CANCEL: 'invoice:cancel',
  PAYMENT_VIEW: 'payment:view',
  PAYMENT_VIEW_ALL: 'payment:view_all',
  PAYMENT_RECORD: 'payment:record',
  PAYMENT_REVERSE: 'payment:reverse',
  DISCOUNT_APPROVE: 'discount:approve',
  FINANCE_REPORTS: 'finance:reports',
  FINANCE_EXPORT: 'finance:export',

  // Communication
  ANNOUNCEMENT_VIEW: 'announcement:view',
  ANNOUNCEMENT_CREATE: 'announcement:create',
  ANNOUNCEMENT_MANAGE: 'announcement:manage',
  MESSAGE_SEND: 'message:send',
  MESSAGE_BULK: 'message:bulk',
  NOTIFICATION_VIEW_LOGS: 'notification:view_logs',
  NOTIFICATION_MANAGE: 'notification:manage',
  TEMPLATE_MANAGE: 'template:manage',

  // Progress & reports
  PROGRESS_VIEW: 'progress:view',
  PROGRESS_VIEW_ALL: 'progress:view_all',
  PROGRESS_NOTE_CREATE: 'progress_note:create',
  PROGRESS_NOTE_VIEW_PRIVATE: 'progress_note:view_private',
  REPORT_VIEW: 'report:view',
  REPORT_VIEW_ALL: 'report:view_all',
  REPORT_EXPORT: 'report:export',

  // Applications
  APPLICATION_VIEW: 'application:view',
  APPLICATION_MANAGE: 'application:manage',
  APPLICATION_REVIEW: 'application:review',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const P = PERMISSIONS;

/** Everything an owner/admin may do. */
const ADMIN_PERMISSIONS: Permission[] = Object.values(P);

/** Academic staff who are not the owner: no finance, no user administration. */
const TEACHER_PERMISSIONS: Permission[] = [
  P.ACADEMY_VIEW,
  P.STUDENT_VIEW,
  P.STUDENT_VIEW_ALL,
  P.STUDENT_UPDATE,
  P.GUARDIAN_VIEW,
  P.COURSE_VIEW,
  P.CLASS_VIEW,
  P.SUBJECT_VIEW,
  P.SESSION_VIEW,
  P.ENROLLMENT_VIEW,
  P.TIMETABLE_VIEW,
  P.ATTENDANCE_VIEW,
  P.ATTENDANCE_VIEW_ALL,
  P.ATTENDANCE_MARK,
  P.ATTENDANCE_EDIT,
  P.ATTENDANCE_EXPORT,
  P.ASSIGNMENT_VIEW,
  P.ASSIGNMENT_CREATE,
  P.ASSIGNMENT_GRADE,
  P.ASSIGNMENT_DELETE,
  P.RESOURCE_VIEW,
  P.RESOURCE_MANAGE,
  P.EXAM_VIEW,
  P.MARKS_VIEW,
  P.MARKS_ENTER,
  P.ANNOUNCEMENT_VIEW,
  P.ANNOUNCEMENT_CREATE,
  P.PROGRESS_VIEW,
  P.PROGRESS_VIEW_ALL,
  P.PROGRESS_NOTE_CREATE,
  P.REPORT_VIEW,
  P.REPORT_VIEW_ALL,
  P.REPORT_EXPORT,
  P.EXAM_SCHEDULE,
  P.EXAM_MANAGE,
  P.MESSAGE_SEND,
];

/** Students see only their own records. */
const STUDENT_PERMISSIONS: Permission[] = [
  P.ACADEMY_VIEW,
  P.COURSE_VIEW,
  P.CLASS_VIEW,
  P.SUBJECT_VIEW,
  P.TIMETABLE_VIEW,
  P.ATTENDANCE_VIEW,
  P.ASSIGNMENT_VIEW,
  P.RESOURCE_VIEW,
  P.EXAM_VIEW,
  P.MARKS_VIEW,
  P.ANNOUNCEMENT_VIEW,
  P.PROGRESS_VIEW,
  P.REPORT_VIEW,
  P.INVOICE_VIEW,
  P.PAYMENT_VIEW,
  P.FEE_STRUCTURE_VIEW,
];

/** Parents see their linked children's records only. */
const PARENT_PERMISSIONS: Permission[] = [
  P.ACADEMY_VIEW,
  P.COURSE_VIEW,
  P.CLASS_VIEW,
  P.TIMETABLE_VIEW,
  P.ATTENDANCE_VIEW,
  P.ASSIGNMENT_VIEW,
  P.EXAM_VIEW,
  P.MARKS_VIEW,
  P.ANNOUNCEMENT_VIEW,
  P.PROGRESS_VIEW,
  P.REPORT_VIEW,
  P.INVOICE_VIEW,
  P.PAYMENT_VIEW,
  P.FEE_STRUCTURE_VIEW,
  P.GUARDIAN_VIEW,
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.ADMIN]: ADMIN_PERMISSIONS,
  [Role.TEACHER]: TEACHER_PERMISSIONS,
  [Role.STUDENT]: STUDENT_PERMISSIONS,
  [Role.PARENT]: PARENT_PERMISSIONS,
};

export interface GrantLike {
  action: string;
  resource: string;
  expiresAt?: Date | null;
}

export function permissionKey(action: string, resource: string): string {
  return `${resource}:${action}`;
}

/**
 * Effective permission set = role defaults ∪ active explicit grants.
 * Expired grants are ignored, so temporary elevation cannot outlive its window.
 */
export function effectivePermissions(role: Role, grants: GrantLike[] = []): Set<string> {
  const set = new Set<string>(
    ROLE_PERMISSIONS[role].map((perm) => perm as string),
  );

  const now = new Date();
  for (const grant of grants) {
    if (grant.expiresAt && grant.expiresAt.getTime() <= now.getTime()) continue;
    set.add(`${grant.resource}:${grant.action}`);
  }

  return set;
}

export function hasPermission(
  permissions: Set<string>,
  permission: Permission,
): boolean {
  return permissions.has(permission);
}

export function hasAnyPermission(
  permissions: Set<string>,
  required: Permission[],
): boolean {
  return required.some((p) => permissions.has(p));
}

export function hasAllPermissions(
  permissions: Set<string>,
  required: Permission[],
): boolean {
  return required.every((p) => permissions.has(p));
}

/** Landing route for each role after sign-in. */
export const ROLE_HOME: Record<Role, string> = {
  [Role.ADMIN]: '/admin',
  [Role.TEACHER]: '/teacher',
  [Role.STUDENT]: '/student',
  [Role.PARENT]: '/parent',
};

export function homeForRole(role: Role): string {
  return ROLE_HOME[role] ?? '/';
}
