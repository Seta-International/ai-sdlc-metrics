import type { ScopeTypeValue } from '../entities/role-grant.entity'

export const SCOPE_TYPES: ScopeTypeValue[] = ['global', 'department', 'project', 'account']

export function isValidScopeType(value: string): value is ScopeTypeValue {
  return SCOPE_TYPES.includes(value as ScopeTypeValue)
}
