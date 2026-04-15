import type { BulkOperation, BulkOperationStatus } from '../entities/bulk-operation.entity'

export const BULK_OPERATION_REPOSITORY = Symbol('IBulkOperationRepository')

export interface IBulkOperationRepository {
  findById(id: string, tenantId: string): Promise<BulkOperation | null>
  insert(data: Omit<BulkOperation, 'id'>): Promise<BulkOperation>
  updateStatus(id: string, tenantId: string, status: BulkOperationStatus): Promise<void>
  updateProgress(
    id: string,
    tenantId: string,
    successCount: number,
    failureCount: number,
    errors: Record<string, unknown> | null,
  ): Promise<void>
}
