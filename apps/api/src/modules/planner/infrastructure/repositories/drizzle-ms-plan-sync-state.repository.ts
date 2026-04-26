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

  async pauseAllPlansForGroup(tenantId: string, groupId: string, until: Date): Promise<void> {
    await this.db.execute(sql`
      UPDATE planner.ms_plan_sync_state
      SET poll_paused_until = ${until}
      WHERE tenant_id = ${tenantId}
        AND plan_id IN (
          SELECT id FROM planner.plan
          WHERE tenant_id = ${tenantId}
            AND container_ref = (
              SELECT ms_group_id FROM planner.ms_linked_group
              WHERE id = ${groupId} AND tenant_id = ${tenantId}
            )
        )
    `)
  }

  async incrementErrorCountForGroup(
    tenantId: string,
    groupId: string,
    message: string,
  ): Promise<void> {
    await this.db.execute(sql`
      UPDATE planner.ms_plan_sync_state
      SET consecutive_error_count = consecutive_error_count + 1,
          last_error_message = ${message},
          last_polled_at = NOW()
      WHERE tenant_id = ${tenantId}
        AND plan_id IN (
          SELECT id FROM planner.plan
          WHERE tenant_id = ${tenantId}
            AND container_ref = (
              SELECT ms_group_id FROM planner.ms_linked_group
              WHERE id = ${groupId} AND tenant_id = ${tenantId}
            )
        )
    `)
  }

  async maxConsecutiveErrorCountForGroup(tenantId: string, groupId: string): Promise<number> {
    const result = await this.db.execute<{ max_count: number }>(sql`
      SELECT COALESCE(MAX(consecutive_error_count), 0) AS max_count
      FROM planner.ms_plan_sync_state
      WHERE tenant_id = ${tenantId}
        AND plan_id IN (
          SELECT id FROM planner.plan
          WHERE tenant_id = ${tenantId}
            AND container_ref = (
              SELECT ms_group_id FROM planner.ms_linked_group
              WHERE id = ${groupId} AND tenant_id = ${tenantId}
            )
        )
    `)
    const row = result.rows[0]
    return row ? Number(row.max_count) : 0
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
