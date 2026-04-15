import { Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { DB_TOKEN, type Db } from '@future/db'
import type {
  BulkOperation,
  BulkOperationStatus,
} from '../../domain/entities/bulk-operation.entity'
import type { IBulkOperationRepository } from '../../domain/repositories/bulk-operation.repository'
import { bulkOperation } from '../schema/people.schema'

@Injectable()
export class DrizzleBulkOperationRepository implements IBulkOperationRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<BulkOperation | null> {
    const rows = await this.db
      .select()
      .from(bulkOperation)
      .where(and(eq(bulkOperation.id, id), eq(bulkOperation.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as BulkOperation) ?? null
  }

  async insert(data: Omit<BulkOperation, 'id'>): Promise<BulkOperation> {
    const rows = await this.db
      .insert(bulkOperation)
      .values(data as Record<string, unknown>)
      .returning()
    return rows[0] as BulkOperation
  }

  async updateStatus(id: string, tenantId: string, status: BulkOperationStatus): Promise<void> {
    await this.db
      .update(bulkOperation)
      .set({ status } as Record<string, unknown>)
      .where(and(eq(bulkOperation.id, id), eq(bulkOperation.tenantId, tenantId)))
  }

  async updateProgress(
    id: string,
    tenantId: string,
    successCount: number,
    failureCount: number,
    errors: Record<string, unknown> | null,
  ): Promise<void> {
    await this.db
      .update(bulkOperation)
      .set({ successCount, failureCount, errors } as Record<string, unknown>)
      .where(and(eq(bulkOperation.id, id), eq(bulkOperation.tenantId, tenantId)))
  }
}
