/**
 * Single source of truth for permission keys.
 *
 * Every `meta({ permission: PERMISSIONS.X })` on a tRPC route MUST reference
 * a value from this registry. A drift test (`permissions.spec.ts`) walks the
 * router files at build/test time and fails CI if a route uses a string that
 * isn't present here.
 *
 * `tenant_admin` and `platform_admin` roles are auto-granted every key in
 * `ALL_PERMISSION_KEYS`, so adding a new entry here is the only step needed
 * to give admins access to a new feature — no manual sync to default-role
 * mappings, no missing-permission denials.
 */
export const PERMISSIONS = {
  // ── admin (tenant + platform operations) ──────────────────────────────
  ADMIN_ROLE_READ: 'admin:role:read',
  ADMIN_ROLE_MANAGE: 'admin:role:manage',
  ADMIN_TENANT_READ: 'admin:tenant:read',
  ADMIN_TENANT_MANAGE: 'admin:tenant:manage',
  ADMIN_TENANT_TIMEZONE_UPDATE: 'admin:tenant:timezone:update',
  ADMIN_AUDIT_READ: 'admin:audit:read',
  ADMIN_IDP_READ: 'admin:idp:read',
  ADMIN_IDP_CONFIGURE: 'admin:idp:configure',
  ADMIN_IDP_SYNC: 'admin:idp:sync',
  ADMIN_USER_READ: 'admin:user:read',
  ADMIN_USER_MANAGE: 'admin:user:manage',
  ADMIN_AGENT_READ: 'admin:agent:read',
  ADMIN_AGENT_MANAGE: 'admin:agent:manage',

  // ── people (profiles, directory, settings) ────────────────────────────
  PEOPLE_PROFILE_READ: 'people:profile:read',
  PEOPLE_PROFILE_SELF_READ: 'people:profile:self:read',
  PEOPLE_PROFILE_TEAM_READ: 'people:profile:team:read',
  PEOPLE_PROFILE_CREATE: 'people:profile:create',
  PEOPLE_PROFILE_UPDATE: 'people:profile:update',
  PEOPLE_DIRECTORY_READ: 'people:directory:read',
  PEOPLE_DIRECTORY_EXPORT: 'people:directory:export',
  PEOPLE_SHARE_LINK_CREATE: 'people:shareLink:create',
  PEOPLE_SHARE_LINK_REVOKE: 'people:shareLink:revoke',
  PEOPLE_EMAIL_GENERATE: 'people:email:generate',
  PEOPLE_BULK_WRITE: 'people:bulk:write',
  PEOPLE_IMPORT_WRITE: 'people:import:write',
  PEOPLE_SETTINGS_READ: 'people:settings:read',
  PEOPLE_SETTINGS_WRITE: 'people:settings:write',
  PEOPLE_ADMIN: 'people:admin',
  PEOPLE_EMPLOYMENT_REHIRE: 'people:employment:rehire',

  // ── time (attendance, leave) ──────────────────────────────────────────
  TIME_LEAVE_SELF_SUBMIT: 'time:leave:self:submit',
  TIME_LEAVE_READ: 'time:leave:read',
  TIME_LEAVE_APPROVE: 'time:leave:approve',
  TIME_ATTENDANCE_SELF_READ: 'time:attendance:self:read',
  TIME_ATTENDANCE_READ: 'time:attendance:read',

  // ── hiring (recruitment pipeline) ─────────────────────────────────────
  HIRING_CANDIDATE_READ: 'hiring:candidate:read',
  HIRING_CANDIDATE_CREATE: 'hiring:candidate:create',
  HIRING_PIPELINE_MANAGE: 'hiring:pipeline:manage',

  // ── performance (reviews) ─────────────────────────────────────────────
  PERFORMANCE_REVIEW_SUBMIT: 'performance:review:submit',
  PERFORMANCE_REVIEW_READ: 'performance:review:read',

  // ── finance (invoicing, payroll, budget) ──────────────────────────────
  FINANCE_INVOICE_READ: 'finance:invoice:read',
  FINANCE_PAYROLL_READ: 'finance:payroll:read',
  FINANCE_BUDGET_MANAGE: 'finance:budget:manage',

  // ── projects (delivery, staffing) ─────────────────────────────────────
  PROJECTS_ASSIGNMENT_MANAGE: 'projects:assignment:manage',
  PROJECTS_STAFFING_READ: 'projects:staffing:read',

  // ── planner (personal task tracking) ──────────────────────────────────
  PLANNER_TASK_SELF_MANAGE: 'planner:task:self:manage',
  PLANNER_PLAN_CREATE: 'planner:plan:create',
  PLANNER_PLAN_DELETE_ANY: 'planner:plan:delete-any',
  PLANNER_PLAN_READ_ANY: 'planner:plan:read-any',
  PLANNER_PLAN_MANAGE_MEMBERS_ANY: 'planner:plan:manage-members-any',
  PLANNER_TASK_COMPLETE_ANY: 'planner:task:complete-any',
  PLANNER_PERSONAL_READ: 'planner:personal:read',
  PLANNER_PERSONAL_WRITE: 'planner:personal:write',
} as const

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const ALL_PERMISSION_KEYS: readonly PermissionKey[] = Object.values(PERMISSIONS)

/** O(1) lookup used by the drift test. */
export const PERMISSION_KEY_SET: ReadonlySet<string> = new Set(ALL_PERMISSION_KEYS)
