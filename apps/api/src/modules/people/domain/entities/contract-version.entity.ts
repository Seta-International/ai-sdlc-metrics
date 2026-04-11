export type ContractStatus = 'draft' | 'active' | 'expired' | 'terminated'

export interface ContractVersion {
  id: string
  tenantId: string
  profileId: string
  contractType: string
  status: ContractStatus
  startedAt: Date
  endedAt: Date | null
  probationEndDate: Date | null
  note: string | null
  createdAt: Date
}
