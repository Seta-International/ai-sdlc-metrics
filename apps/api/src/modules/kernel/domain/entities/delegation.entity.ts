export interface Delegation {
  id: string
  tenantId: string
  delegatorId: string
  delegateeId: string
  role: string
  validFrom: Date
  validUntil: Date
}
