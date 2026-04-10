import type { RoleKeyValue } from '../entities/role-grant.entity'

export const ROLE_KEYS: RoleKeyValue[] = [
  'hr_ops',
  'line_manager',
  'staffing_owner',
  'account_manager',
  'finance_operator',
  'executive',
  'employee',
  'review_operator',
  'recruiter',
  'tenant_admin',
  'platform_admin',
]

export function isValidRoleKey(value: string): value is RoleKeyValue {
  return ROLE_KEYS.includes(value as RoleKeyValue)
}
