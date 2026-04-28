import type { RoleKeyValue } from '../entities/role-grant.entity'
import {
  ALL_PERMISSION_KEYS,
  PERMISSIONS,
  type PermissionKey,
} from '../../../../common/auth/permissions'

export interface DefaultPermissionEntry {
  permissionKey: PermissionKey
  isLocked: boolean
}

export type DefaultRolePermissionMap = Record<RoleKeyValue, DefaultPermissionEntry[]>

/**
 * Baseline employee capabilities: every role inherits these because every
 * authenticated user can read their own profile and submit their own time.
 * Locked = a tenant admin cannot revoke them via the role-permission UI.
 */
const EMPLOYEE_LOCKED: DefaultPermissionEntry[] = [
  { permissionKey: PERMISSIONS.PEOPLE_PROFILE_SELF_READ, isLocked: true },
  { permissionKey: PERMISSIONS.TIME_LEAVE_SELF_SUBMIT, isLocked: true },
  { permissionKey: PERMISSIONS.TIME_ATTENDANCE_SELF_READ, isLocked: true },
]

const EMPLOYEE_DEFAULTS: DefaultPermissionEntry[] = [
  { permissionKey: PERMISSIONS.PEOPLE_PROFILE_READ, isLocked: false },
  { permissionKey: PERMISSIONS.PEOPLE_DIRECTORY_READ, isLocked: false },
  { permissionKey: PERMISSIONS.PEOPLE_ORG_READ, isLocked: false },
  { permissionKey: PERMISSIONS.PLANNER_TASK_SELF_MANAGE, isLocked: false },
  { permissionKey: PERMISSIONS.PLANNER_PLAN_CREATE, isLocked: false },
  { permissionKey: PERMISSIONS.PLANNER_PERSONAL_READ, isLocked: false },
  { permissionKey: PERMISSIONS.PLANNER_PERSONAL_WRITE, isLocked: false },
]

/**
 * Permissions that should always belong to whoever owns the tenant. Locked
 * because removing them would brick admin access to their own admin surfaces.
 */
const TENANT_ADMIN_LOCKED_KEYS: readonly PermissionKey[] = [
  PERMISSIONS.ADMIN_ROLE_MANAGE,
  PERMISSIONS.ADMIN_TENANT_READ,
]

const TENANT_ADMIN_LOCKED_SET = new Set<PermissionKey>(TENANT_ADMIN_LOCKED_KEYS)

/**
 * Platform-only permission keys — never granted to tenant_admin.
 * These allow cross-tenant operations reserved for SETA operators only.
 */
const PLATFORM_ONLY_KEYS: ReadonlySet<PermissionKey> = new Set<PermissionKey>([
  PERMISSIONS.ADMIN_PLATFORM_READ,
  PERMISSIONS.ADMIN_PLATFORM_MANAGE,
  PERMISSIONS.ADMIN_TENANT_SWITCH,
])

/**
 * platform_admin receives every key in the registry (SETA operator access).
 * Adding a new permission to PERMISSIONS automatically grants it to platform_admin —
 * no manual sync, no missing-permission denials when shipping a new route.
 */
const ALL_AS_PLATFORM_ADMIN_ENTRIES: DefaultPermissionEntry[] = ALL_PERMISSION_KEYS.map((key) => ({
  permissionKey: key,
  isLocked: TENANT_ADMIN_LOCKED_SET.has(key),
}))

/**
 * tenant_admin receives every key except platform-only keys.
 * Platform-only keys (admin:platform:*, admin:tenant:switch) are reserved for
 * SETA operators (platform_admin) and must never be granted to tenant admins.
 */
const TENANT_ADMIN_ENTRIES: DefaultPermissionEntry[] = ALL_PERMISSION_KEYS.filter(
  (key) => !PLATFORM_ONLY_KEYS.has(key),
).map((key) => ({
  permissionKey: key,
  isLocked: TENANT_ADMIN_LOCKED_SET.has(key),
}))

export const DEFAULT_ROLE_PERMISSIONS: DefaultRolePermissionMap = {
  employee: [...EMPLOYEE_LOCKED, ...EMPLOYEE_DEFAULTS],

  line_manager: [
    ...EMPLOYEE_LOCKED,
    { permissionKey: PERMISSIONS.PEOPLE_PROFILE_READ, isLocked: false },
    { permissionKey: PERMISSIONS.PEOPLE_PROFILE_TEAM_READ, isLocked: true },
    { permissionKey: PERMISSIONS.PEOPLE_DIRECTORY_READ, isLocked: false },
    { permissionKey: PERMISSIONS.TIME_LEAVE_APPROVE, isLocked: false },
    { permissionKey: PERMISSIONS.PERFORMANCE_REVIEW_SUBMIT, isLocked: false },
  ],

  hr_ops: [
    ...EMPLOYEE_LOCKED,
    { permissionKey: PERMISSIONS.PEOPLE_PROFILE_READ, isLocked: false },
    { permissionKey: PERMISSIONS.PEOPLE_PROFILE_UPDATE, isLocked: false },
    { permissionKey: PERMISSIONS.PEOPLE_ORG_READ, isLocked: false },
    { permissionKey: PERMISSIONS.PEOPLE_DIRECTORY_READ, isLocked: false },
    { permissionKey: PERMISSIONS.PEOPLE_DIRECTORY_EXPORT, isLocked: false },
    { permissionKey: PERMISSIONS.PEOPLE_SETTINGS_READ, isLocked: false },
    { permissionKey: PERMISSIONS.TIME_LEAVE_READ, isLocked: false },
    { permissionKey: PERMISSIONS.HIRING_CANDIDATE_READ, isLocked: false },
  ],

  tenant_admin: TENANT_ADMIN_ENTRIES,

  recruiter: [
    ...EMPLOYEE_LOCKED,
    { permissionKey: PERMISSIONS.HIRING_CANDIDATE_READ, isLocked: false },
    { permissionKey: PERMISSIONS.HIRING_CANDIDATE_CREATE, isLocked: false },
    { permissionKey: PERMISSIONS.HIRING_PIPELINE_MANAGE, isLocked: false },
  ],

  finance_operator: [
    ...EMPLOYEE_LOCKED,
    { permissionKey: PERMISSIONS.FINANCE_INVOICE_READ, isLocked: false },
    { permissionKey: PERMISSIONS.FINANCE_PAYROLL_READ, isLocked: false },
    { permissionKey: PERMISSIONS.FINANCE_BUDGET_MANAGE, isLocked: false },
  ],

  project_manager: [
    ...EMPLOYEE_LOCKED,
    { permissionKey: PERMISSIONS.PROJECTS_ASSIGNMENT_MANAGE, isLocked: false },
    { permissionKey: PERMISSIONS.PROJECTS_STAFFING_READ, isLocked: false },
  ],

  platform_admin: ALL_AS_PLATFORM_ADMIN_ENTRIES,

  executive: [
    ...EMPLOYEE_LOCKED,
    { permissionKey: PERMISSIONS.PEOPLE_PROFILE_READ, isLocked: false },
    { permissionKey: PERMISSIONS.PEOPLE_DIRECTORY_READ, isLocked: false },
    { permissionKey: PERMISSIONS.FINANCE_INVOICE_READ, isLocked: false },
    { permissionKey: PERMISSIONS.FINANCE_BUDGET_MANAGE, isLocked: false },
    { permissionKey: PERMISSIONS.PROJECTS_STAFFING_READ, isLocked: false },
  ],

  staffing_owner: [
    ...EMPLOYEE_LOCKED,
    { permissionKey: PERMISSIONS.PROJECTS_ASSIGNMENT_MANAGE, isLocked: false },
    { permissionKey: PERMISSIONS.PROJECTS_STAFFING_READ, isLocked: false },
  ],

  account_manager: [
    ...EMPLOYEE_LOCKED,
    { permissionKey: PERMISSIONS.PROJECTS_STAFFING_READ, isLocked: false },
    { permissionKey: PERMISSIONS.FINANCE_INVOICE_READ, isLocked: false },
  ],

  review_operator: [
    ...EMPLOYEE_LOCKED,
    { permissionKey: PERMISSIONS.PERFORMANCE_REVIEW_SUBMIT, isLocked: false },
    { permissionKey: PERMISSIONS.PERFORMANCE_REVIEW_READ, isLocked: false },
  ],
}
