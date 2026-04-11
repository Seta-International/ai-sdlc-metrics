import type { RoleKeyValue } from '../entities/role-grant.entity'

export interface DefaultPermissionEntry {
  permissionKey: string
  isLocked: boolean
}

export type DefaultRolePermissionMap = Record<RoleKeyValue, DefaultPermissionEntry[]>

const EMPLOYEE_LOCKED: DefaultPermissionEntry[] = [
  { permissionKey: 'people:profile:self:read', isLocked: true },
  { permissionKey: 'time:leave:self:submit', isLocked: true },
  { permissionKey: 'time:attendance:self:read', isLocked: true },
]

const EMPLOYEE_DEFAULTS: DefaultPermissionEntry[] = [
  { permissionKey: 'planner:task:self:manage', isLocked: false },
]

const TENANT_ADMIN_LOCKED: DefaultPermissionEntry[] = [
  { permissionKey: 'admin:role:manage', isLocked: true },
  { permissionKey: 'admin:tenant:read', isLocked: true },
]

const ALL_PERMISSIONS: DefaultPermissionEntry[] = [
  { permissionKey: 'people:profile:read', isLocked: false },
  { permissionKey: 'people:profile:update', isLocked: false },
  { permissionKey: 'people:profile:self:read', isLocked: false },
  { permissionKey: 'people:profile:team:read', isLocked: false },
  { permissionKey: 'time:leave:self:submit', isLocked: false },
  { permissionKey: 'time:leave:read', isLocked: false },
  { permissionKey: 'time:leave:approve', isLocked: false },
  { permissionKey: 'time:attendance:self:read', isLocked: false },
  { permissionKey: 'time:attendance:read', isLocked: false },
  { permissionKey: 'hiring:candidate:read', isLocked: false },
  { permissionKey: 'hiring:candidate:create', isLocked: false },
  { permissionKey: 'hiring:pipeline:manage', isLocked: false },
  { permissionKey: 'performance:review:submit', isLocked: false },
  { permissionKey: 'performance:review:read', isLocked: false },
  { permissionKey: 'finance:invoice:read', isLocked: false },
  { permissionKey: 'finance:payroll:read', isLocked: false },
  { permissionKey: 'finance:budget:manage', isLocked: false },
  { permissionKey: 'projects:assignment:manage', isLocked: false },
  { permissionKey: 'projects:staffing:read', isLocked: false },
  { permissionKey: 'planner:task:self:manage', isLocked: false },
  // admin:role:manage and admin:tenant:read omitted here; added as locked via TENANT_ADMIN_LOCKED
  { permissionKey: 'admin:tenant:manage', isLocked: false },
]

export const DEFAULT_ROLE_PERMISSIONS: DefaultRolePermissionMap = {
  employee: [...EMPLOYEE_LOCKED, ...EMPLOYEE_DEFAULTS],

  line_manager: [
    ...EMPLOYEE_LOCKED,
    { permissionKey: 'people:profile:team:read', isLocked: true },
    { permissionKey: 'time:leave:approve', isLocked: false },
    { permissionKey: 'performance:review:submit', isLocked: false },
  ],

  hr_ops: [
    ...EMPLOYEE_LOCKED,
    { permissionKey: 'people:profile:read', isLocked: false },
    { permissionKey: 'people:profile:update', isLocked: false },
    { permissionKey: 'time:leave:read', isLocked: false },
    { permissionKey: 'hiring:candidate:read', isLocked: false },
  ],

  tenant_admin: [...TENANT_ADMIN_LOCKED, ...ALL_PERMISSIONS],

  recruiter: [
    ...EMPLOYEE_LOCKED,
    { permissionKey: 'hiring:candidate:read', isLocked: false },
    { permissionKey: 'hiring:candidate:create', isLocked: false },
    { permissionKey: 'hiring:pipeline:manage', isLocked: false },
  ],

  finance_operator: [
    ...EMPLOYEE_LOCKED,
    { permissionKey: 'finance:invoice:read', isLocked: false },
    { permissionKey: 'finance:payroll:read', isLocked: false },
    { permissionKey: 'finance:budget:manage', isLocked: false },
  ],

  project_manager: [
    ...EMPLOYEE_LOCKED,
    { permissionKey: 'projects:assignment:manage', isLocked: false },
    { permissionKey: 'projects:staffing:read', isLocked: false },
  ],

  platform_admin: [...TENANT_ADMIN_LOCKED, ...ALL_PERMISSIONS],

  executive: [
    ...EMPLOYEE_LOCKED,
    { permissionKey: 'people:profile:read', isLocked: false },
    { permissionKey: 'finance:invoice:read', isLocked: false },
    { permissionKey: 'finance:budget:manage', isLocked: false },
    { permissionKey: 'projects:staffing:read', isLocked: false },
  ],

  staffing_owner: [
    ...EMPLOYEE_LOCKED,
    { permissionKey: 'projects:assignment:manage', isLocked: false },
    { permissionKey: 'projects:staffing:read', isLocked: false },
  ],

  account_manager: [
    ...EMPLOYEE_LOCKED,
    { permissionKey: 'projects:staffing:read', isLocked: false },
    { permissionKey: 'finance:invoice:read', isLocked: false },
  ],

  review_operator: [
    ...EMPLOYEE_LOCKED,
    { permissionKey: 'performance:review:submit', isLocked: false },
    { permissionKey: 'performance:review:read', isLocked: false },
  ],
}
