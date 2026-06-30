/**
 * roleHelpers.ts — Single source of truth for role identification checks.
 *
 * The "student" role in the database represents the parent/family login
 * that shows the child's data. There is no separate parent account.
 *
 * Gate ALL student/parent-specific persistence code behind isStudentRole()
 * so there are no scattered inline `role === 'student'` comparisons.
 */

/** Login roles assignable when creating staff (Contact & Login section). */
export const STAFF_ADD_LOGIN_ROLE_OPTIONS = [
  { code: 'staff', label: 'Staff / Teacher', portal: 'staff' as const },
  { code: 'principal', label: 'Principal', portal: 'staff' as const },
  { code: 'admin', label: 'Administrator', portal: 'admin' as const },
  { code: 'driver', label: 'Driver', portal: 'driver' as const },
] as const;

export type StaffAddLoginRoleCode = (typeof STAFF_ADD_LOGIN_ROLE_OPTIONS)[number]['code'];

/** Role codes that may sign in through the Staff portal login screen. */
export const STAFF_LOGIN_ALLOWED_ROLE_CODES: readonly string[] = [
  ...STAFF_ADD_LOGIN_ROLE_OPTIONS.map((o) => o.code),
  'teacher', // legacy alias — DB stores `staff`, some sessions may still report `teacher`
];

/** Role codes that may access /staff/* routes after login. */
export const STAFF_PORTAL_ROLE_CODES: readonly string[] = [
  ...STAFF_ADD_LOGIN_ROLE_OPTIONS.filter((o) => o.portal === 'staff').map((o) => o.code),
  'teacher',
];

/**
 * Map a staff designation name to the login role assigned on create.
 * Keeps add-staff and staff-login in sync.
 */
export function resolveRoleFromDesignation(designationName: string | null | undefined): StaffAddLoginRoleCode {
  const name = String(designationName || '').trim().toLowerCase();
  if (name === 'principal') return 'principal';
  if (name.includes('admin')) return 'admin';
  if (name === 'driver') return 'driver';
  return 'staff';
}

/**
 * Check if a role code represents a student/parent account.
 * Student accounts are the parent-facing login used by families.
 */
export function isStudentRole(roleCode: string | null | undefined): boolean {
  return roleCode === 'student' || roleCode === 'students';
}

/**
 * Roles whose session must NEVER be auto-logged-out.
 *
 * Parent (student), admin, driver, and staff/teacher/principal logins stay
 * signed in until the user manually taps Logout. A failed token refresh, a
 * transient 401, or a Supabase SIGNED_OUT event (refresh-token rejection) must
 * NOT evict these roles — the app keeps the cached session and keeps retrying.
 *
 * The ONLY role deliberately excluded is `accountant` (Accounts department
 * login), which retains its school-hours / short-lived session restrictions.
 *
 * Unknown/empty roles default to persistent so an ambiguous role is never
 * accidentally logged out.
 */
export function isPersistentSessionRole(roleCode: string | null | undefined): boolean {
  if (!roleCode) return true;
  return roleCode !== 'accountant' && roleCode !== 'accounts';
}

/** Roles allowed to sign in through the Staff portal login screen. */
export function isStaffLoginAllowedRole(roleCode: string | null | undefined): boolean {
  if (!roleCode) return false;
  return STAFF_LOGIN_ALLOWED_ROLE_CODES.includes(roleCode);
}

/** Roles allowed to access /staff/* app routes. */
export function isStaffPortalRole(roleCode: string | null | undefined): boolean {
  if (!roleCode) return false;
  return STAFF_PORTAL_ROLE_CODES.includes(roleCode);
}

export function normalizeLoginEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

/** Deduplicate designation rows by name (defensive if API ever returns duplicates). */
export function dedupeDesignationsByName<T extends { id: number; name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
