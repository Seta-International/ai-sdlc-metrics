export type BillingType = 'billable' | 'non_billable'
export type MemberType = 'core' | 'shadow' | 'backfill'
export type AllocationStatus = 'tentative' | 'confirmed'

export interface Allocation {
  id: string
  tenantId: string
  projectId: string
  projectRoleId: string
  actorId: string | null
  position: string | null
  hoursPerDay: string // numeric comes back as string from PG
  billingType: BillingType
  memberType: MemberType
  status: AllocationStatus
  startedAt: Date
  endedAt: Date | null
  note: string | null
  createdAt: Date
  updatedAt: Date
}
