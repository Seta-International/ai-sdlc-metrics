import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { MsProfileSyncState } from '../../domain/entities/ms-profile-sync-state.entity'
import type { IMsProfileSyncStateRepository } from '../../domain/repositories/ms-profile-sync-state.repository'
import { msProfileSyncState } from '../schema/people.schema'

@Injectable()
export class DrizzleMsProfileSyncStateRepository implements IMsProfileSyncStateRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findByTenantId(tenantId: string): Promise<MsProfileSyncState | null> {
    const rows = await this.db
      .select()
      .from(msProfileSyncState)
      .where(eq(msProfileSyncState.tenantId, tenantId))
      .limit(1)
    return (rows[0] as MsProfileSyncState | undefined) ?? null
  }

  async upsert(tenantId: string, deltaToken: string | null, lastSyncedAt: Date): Promise<void> {
    await this.db
      .insert(msProfileSyncState)
      .values({ tenantId, deltaToken, lastSyncedAt })
      .onConflictDoUpdate({
        target: msProfileSyncState.tenantId,
        set: { deltaToken, lastSyncedAt },
      })
  }

  async clearDeltaToken(tenantId: string): Promise<void> {
    await this.db
      .update(msProfileSyncState)
      .set({ deltaToken: null })
      .where(eq(msProfileSyncState.tenantId, tenantId))
  }
}
