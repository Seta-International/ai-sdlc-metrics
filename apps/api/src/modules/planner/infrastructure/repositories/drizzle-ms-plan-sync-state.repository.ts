import { Injectable, Inject } from '@nestjs/common'
import { and, eq, isNotNull, lte } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { IMsPlanSyncStateRepository } from '../../domain/repositories/ms-plan-sync-state.repository'
import { MsPlanSyncStateEntity } from '../../domain/entities/ms-plan-sync-state.entity'
import { msPlanSyncState } from '../schema/planner.schema'

@Injectable()
export class DrizzleMsPlanSyncStateRepository implements IMsPlanSyncStateRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async get(planId: string): Promise<MsPlanSyncStateEntity | null> {
    const rows = await this.db
      .select()
      .from(msPlanSyncState)
      .where(eq(msPlanSyncState.planId, planId))
      .limit(1)
    return rows.length > 0 ? rowToEntity(rows[0]!) : null
  }

  async findByMsPlanId(tenantId: string, msPlanId: string): Promise<MsPlanSyncStateEntity | null> {
    const rows = await this.db
      .select()
      .from(msPlanSyncState)
      .where(and(eq(msPlanSyncState.tenantId, tenantId), eq(msPlanSyncState.msPlanId, msPlanId)))
      .limit(1)
    return rows.length > 0 ? rowToEntity(rows[0]!) : null
  }

  async upsertState(entity: MsPlanSyncStateEntity): Promise<void> {
    await this.db
      .insert(msPlanSyncState)
      .values({
        planId: entity.planId,
        tenantId: entity.tenantId,
        msPlanId: entity.msPlanId,
        msPlanEtag: entity.msPlanEtag,
        lastPolledAt: entity.lastPolledAt,
        lastSuccessfulPollAt: entity.lastSuccessfulPollAt,
        consecutiveErrorCount: entity.consecutiveErrorCount,
        lastErrorCode: entity.lastErrorCode,
        lastErrorMessage: entity.lastErrorMessage,
        pollPausedUntil: entity.pollPausedUntil,
      })
      .onConflictDoUpdate({
        target: [msPlanSyncState.planId],
        set: {
          msPlanEtag: entity.msPlanEtag,
          lastPolledAt: entity.lastPolledAt,
          lastSuccessfulPollAt: entity.lastSuccessfulPollAt,
          consecutiveErrorCount: entity.consecutiveErrorCount,
          lastErrorCode: entity.lastErrorCode,
          lastErrorMessage: entity.lastErrorMessage,
          pollPausedUntil: entity.pollPausedUntil,
        },
      })
  }

  async listForTenant(tenantId: string): Promise<MsPlanSyncStateEntity[]> {
    const rows = await this.db
      .select()
      .from(msPlanSyncState)
      .where(eq(msPlanSyncState.tenantId, tenantId))
    return rows.map(rowToEntity)
  }

  async listPausable(tenantId: string): Promise<MsPlanSyncStateEntity[]> {
    const rows = await this.db
      .select()
      .from(msPlanSyncState)
      .where(
        and(
          eq(msPlanSyncState.tenantId, tenantId),
          isNotNull(msPlanSyncState.pollPausedUntil),
          lte(msPlanSyncState.pollPausedUntil, sql`NOW()`),
        ),
      )
    return rows.map(rowToEntity)
  }

  async removeAllForTenant(tenantId: string): Promise<void> {
    await this.db.delete(msPlanSyncState).where(eq(msPlanSyncState.tenantId, tenantId))
  }
}

type MsPlanSyncStateRow = typeof msPlanSyncState.$inferSelect

function rowToEntity(row: MsPlanSyncStateRow): MsPlanSyncStateEntity {
  return MsPlanSyncStateEntity.reconstitute({
    planId: row.planId,
    tenantId: row.tenantId,
    msPlanId: row.msPlanId,
    msPlanEtag: row.msPlanEtag ?? null,
    lastPolledAt: row.lastPolledAt ?? null,
    lastSuccessfulPollAt: row.lastSuccessfulPollAt ?? null,
    consecutiveErrorCount: row.consecutiveErrorCount,
    lastErrorCode: row.lastErrorCode ?? null,
    lastErrorMessage: row.lastErrorMessage ?? null,
    pollPausedUntil: row.pollPausedUntil ?? null,
  })
}
