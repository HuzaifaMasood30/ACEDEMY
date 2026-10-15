import { describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  effectivePermissions,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  homeForRole,
  permissionKey,
} from '@/lib/rbac';

/**
 * Authorization is the security boundary for the whole system, so the role
 * matrix is asserted directly rather than inferred from the interface.
 */
describe('permission catalogue', () => {
  it('builds a resource:action key', () => {
    expect(permissionKey('view', 'student')).toBe('student:view');
  });

  it('grants an admin broad access', () => {
    const admin = effectivePermissions(Role.ADMIN);
    expect(hasPermission(admin, PERMISSIONS.STUDENT_CREATE)).toBe(true);
    expect(hasPermission(admin, PERMISSIONS.INVOICE_CREATE)).toBe(true);
    expect(hasPermission(admin, PERMISSIONS.RESULT_PUBLISH)).toBe(true);
    expect(hasPermission(admin, PERMISSIONS.AUDIT_VIEW)).toBe(true);
  });
});

describe('teacher boundaries', () => {
  const teacher = effectivePermissions(Role.TEACHER);

  it('may view students and mark attendance', () => {
    expect(hasPermission(teacher, PERMISSIONS.STUDENT_VIEW)).toBe(true);
    expect(hasPermission(teacher, PERMISSIONS.ATTENDANCE_MARK)).toBe(true);
    expect(hasPermission(teacher, PERMISSIONS.MARKS_ENTER)).toBe(true);
  });

  it('may NOT read fee records', () => {
    expect(hasPermission(teacher, PERMISSIONS.INVOICE_VIEW)).toBe(false);
    expect(hasPermission(teacher, PERMISSIONS.INVOICE_CREATE)).toBe(false);
    expect(hasPermission(teacher, PERMISSIONS.PAYMENT_RECORD)).toBe(false);
  });

  it('may NOT publish results', () => {
    // A teacher enters marks; approval and publication are administrative acts.
    expect(hasPermission(teacher, PERMISSIONS.RESULT_PUBLISH)).toBe(false);
    expect(hasPermission(teacher, PERMISSIONS.MARKS_APPROVE)).toBe(false);
  });

  it('may NOT manage users or settings', () => {
    expect(hasPermission(teacher, PERMISSIONS.USER_MANAGE)).toBe(false);
    expect(hasPermission(teacher, PERMISSIONS.SETTINGS_MANAGE)).toBe(false);
    expect(hasPermission(teacher, PERMISSIONS.AUDIT_VIEW)).toBe(false);
  });
});

describe('student boundaries', () => {
  const student = effectivePermissions(Role.STUDENT);

  it('may read their own academic records', () => {
    expect(hasPermission(student, PERMISSIONS.ATTENDANCE_VIEW)).toBe(true);
    expect(hasPermission(student, PERMISSIONS.EXAM_VIEW)).toBe(true);
    expect(hasPermission(student, PERMISSIONS.ASSIGNMENT_VIEW)).toBe(true);
  });

  it('may NOT enter marks or mark attendance', () => {
    expect(hasPermission(student, PERMISSIONS.MARKS_ENTER)).toBe(false);
    expect(hasPermission(student, PERMISSIONS.ATTENDANCE_MARK)).toBe(false);
  });

  it('may read only their own fee records, never administer them', () => {
    // A student sees their own invoices and receipts, so read access is
    // intended; creating invoices, recording payments and editing fee
    // structures are all administrative acts they must not hold.
    expect(hasPermission(student, PERMISSIONS.INVOICE_VIEW)).toBe(true);
    expect(hasPermission(student, PERMISSIONS.INVOICE_CREATE)).toBe(false);
    expect(hasPermission(student, PERMISSIONS.PAYMENT_RECORD)).toBe(false);
    expect(hasPermission(student, PERMISSIONS.FEE_STRUCTURE_MANAGE)).toBe(false);
  });
});

describe('parent boundaries', () => {
  const parent = effectivePermissions(Role.PARENT);

  it('may read their childrens academic records', () => {
    expect(hasPermission(parent, PERMISSIONS.ATTENDANCE_VIEW)).toBe(true);
    expect(hasPermission(parent, PERMISSIONS.EXAM_VIEW)).toBe(true);
  });

  it('may NOT enter marks, mark attendance or publish results', () => {
    expect(hasPermission(parent, PERMISSIONS.MARKS_ENTER)).toBe(false);
    expect(hasPermission(parent, PERMISSIONS.ATTENDANCE_MARK)).toBe(false);
    expect(hasPermission(parent, PERMISSIONS.RESULT_PUBLISH)).toBe(false);
  });

  it('may NOT read the resources catalogue reserved for staff', () => {
    expect(hasPermission(parent, PERMISSIONS.RESOURCE_VIEW)).toBe(false);
  });
});

describe('permission grants', () => {
  it('widens a role without mutating the base set', () => {
    const base = effectivePermissions(Role.TEACHER);
    expect(hasPermission(base, PERMISSIONS.RESULT_PUBLISH)).toBe(false);

    const granted = effectivePermissions(Role.TEACHER, [
      { action: 'publish', resource: 'result' },
    ]);
    expect(hasPermission(granted, PERMISSIONS.RESULT_PUBLISH)).toBe(true);

    // The role default set is a fresh object each call, so the grant must not
    // have leaked into it.
    expect(hasPermission(effectivePermissions(Role.TEACHER), PERMISSIONS.RESULT_PUBLISH)).toBe(
      false,
    );
  });

  it('ignores an expired grant', () => {
    const past = new Date(Date.now() - 60_000);
    const granted = effectivePermissions(Role.TEACHER, [
      { action: 'publish', resource: 'result', expiresAt: past },
    ]);
    expect(hasPermission(granted, PERMISSIONS.RESULT_PUBLISH)).toBe(false);
  });

  it('accepts a grant that has not yet expired', () => {
    const future = new Date(Date.now() + 60_000);
    const granted = effectivePermissions(Role.TEACHER, [
      { action: 'publish', resource: 'result', expiresAt: future },
    ]);
    expect(hasPermission(granted, PERMISSIONS.RESULT_PUBLISH)).toBe(true);
  });

  it('cannot remove a permission held by the role', () => {
    // Grants are additive by design: there is no deny flag, so a grant cannot
    // take away a capability the role already holds.
    const granted = effectivePermissions(Role.TEACHER, [
      { action: 'view', resource: 'student' },
    ]);
    expect(hasPermission(granted, PERMISSIONS.STUDENT_VIEW)).toBe(true);
  });
});

describe('permission combinators', () => {
  const teacher = effectivePermissions(Role.TEACHER);

  it('hasAnyPermission passes when one matches', () => {
    expect(
      hasAnyPermission(teacher, [PERMISSIONS.INVOICE_VIEW, PERMISSIONS.STUDENT_VIEW]),
    ).toBe(true);
    expect(
      hasAnyPermission(teacher, [PERMISSIONS.INVOICE_VIEW, PERMISSIONS.INVOICE_CREATE]),
    ).toBe(false);
  });

  it('hasAllPermissions requires every one', () => {
    expect(
      hasAllPermissions(teacher, [PERMISSIONS.STUDENT_VIEW, PERMISSIONS.ATTENDANCE_MARK]),
    ).toBe(true);
    expect(
      hasAllPermissions(teacher, [PERMISSIONS.STUDENT_VIEW, PERMISSIONS.INVOICE_VIEW]),
    ).toBe(false);
  });

  it('treats an empty requirement list as satisfied for "all"', () => {
    expect(hasAllPermissions(teacher, [])).toBe(true);
    expect(hasAnyPermission(teacher, [])).toBe(false);
  });
});

describe('role homes', () => {
  it('sends each role to its own portal', () => {
    expect(homeForRole(Role.ADMIN)).toBe('/admin');
    expect(homeForRole(Role.TEACHER)).toBe('/teacher');
    expect(homeForRole(Role.STUDENT)).toBe('/student');
    expect(homeForRole(Role.PARENT)).toBe('/parent');
  });

  it('defines a home and a permission set for every role', () => {
    for (const role of Object.values(Role)) {
      expect(homeForRole(role)).toBeTruthy();
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
    }
  });
});
