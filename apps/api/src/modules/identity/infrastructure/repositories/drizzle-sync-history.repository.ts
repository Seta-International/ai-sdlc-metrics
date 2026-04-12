import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { desc, eq } from 'drizzle-orm'
import type { SyncHistory } from '../../domain/entities/sync-history.entity'
import type { ISyncHistoryRepository } from '../../domain/repositories/sync-history.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { syncHistory } from '../schema/index'

@Injectable()
export class DrizzleSyncHistoryRepository implements ISyncHistoryRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findLatestByTenantId(tenantId: string, limit: number): Promise<SyncHistory[]> {
    const rows = await this.db
      .select()
      .from(syncHistory)
      .where(eq(syncHistory.tenantId, tenantId))
      .orderBy(desc(syncHistory.startedAt))
      .limit(limit)
    return rows as SyncHistory[]
  }

  async insert(data: {
    tenantId: string
    identityProviderId: string
    status: SyncHistory['status']
    usersCreated: number
    usersDeactivated: number
    rolesChanged: number
    errorMessage: string | null
    startedAt: Date
    completedAt: Date
  }): Promise<SyncHistory> {
    const rows = await this.db
      .insert(syncHistory)
      .values({
        tenantId: data.tenantId,
        identityProviderId: data.identityProviderId,
        status: data.status,
        usersCreated: data.usersCreated,
        usersDeactivated: data.usersDeactivated,
        rolesChanged: data.rolesChanged,
        errorMessage: data.errorMessage,
        startedAt: data.startedAt,
        completedAt: data.completedAt,
      })
      .returning()
    return rows[0] as SyncHistory
  }
}
