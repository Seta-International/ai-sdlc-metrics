export type ActorType = 'person' | 'organization' | 'system'
export type ActorStatus = 'invited' | 'active' | 'inactive' | 'suspended' | 'archived'

export type RoleKeyValue =
  | 'hr_ops'
  | 'line_manager'
  | 'staffing_owner'
  | 'account_manager'
  | 'finance_operator'
  | 'executive'
  | 'employee'
  | 'review_operator'
  | 'recruiter'
  | 'tenant_admin'
  | 'platform_admin'
  | 'project_manager'

export type ScopeTypeValue = 'global' | 'department' | 'project' | 'account'

export type RoleGrantSourceValue = 'manual' | 'idp_sync' | 'delegation'
