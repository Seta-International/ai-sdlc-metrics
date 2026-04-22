export interface ScratchpadEntry {
  tenantId: string
  userId: string
  field: string
  value: unknown
  /** Taint inherited from originating tool result. Bumps approval-tier on consumption. */
  tainted: boolean
  updatedAt: Date
}

export interface ScratchpadValue {
  value: unknown
  tainted: boolean
}
