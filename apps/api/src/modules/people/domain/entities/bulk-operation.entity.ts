export type BulkOperationType = 'department_transfer' | 'status_change' | 'manager_reassign'

export type BulkOperationStatus =
  | 'pending'
  | 'validating'
  | 'previewed'
  | 'processing'
  | 'completed'
  | 'partially_completed'
  | 'failed'

export interface BulkOperation {
  id: string
  tenantId: string
  operationType: BulkOperationType
  employmentIds: string[]
  payload: Record<string, unknown>
  status: BulkOperationStatus
  totalCount: number
  successCount: number
  failureCount: number
  errors: Record<string, unknown> | null
  requestedBy: string
  createdAt: Date
  completedAt: Date | null
}
