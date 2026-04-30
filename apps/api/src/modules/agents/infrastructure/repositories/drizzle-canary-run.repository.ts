import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, gte } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentCanaryRun } from '../schema/agents.schema'
import {
  CANARY_RUN_REPOSITORY,
  type CanaryRunRepository,
  type CanaryRunEntity,
  type CanaryOutcome,
} from '../../domain/repositories/canary-run.repository'
import type { ModelTier } from '../../domain/scorer-types'

type AgentCanaryRunRow = typeof agentCanaryRun.$inferSelect

function toDomain(row: AgentCanaryRunRow): CanaryRunEntity {
  return {
    id: row.id,
    runAt: row.runAt,
    tier: row.tier as ModelTier,
    canaryQueryId: row.canaryQueryId,
    tenantId: row.tenantId,
    traceId: row.traceId,
    outcome: row.outcome as CanaryOutcome,
    score: parseFloat(row.score),
    durationMs: row.durationMs,
  }
}

@Injectable()
export class DrizzleCanaryRunRepository implements CanaryRunRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async insert(run: Omit<CanaryRunEntity, 'id'>): Promise<CanaryRunEntity> {
    const rows = await this.db
      .insert(agentCanaryRun)
      .values({
        runAt: run.runAt,
        tier: run.tier,
        canaryQueryId: run.canaryQueryId,
        tenantId: run.tenantId,
        traceId: run.traceId,
        outcome: run.outcome,
        score: String(run.score),
        durationMs: run.durationMs,
      })
      .returning()

    const row = rows[0]
    if (!row) throw new Error('insert returned no rows')
    return toDomain(row)
  }

  async findRecent(opts: { tier: ModelTier; sinceMs: number }): Promise<CanaryRunEntity[]> {
    const since = new Date(Date.now() - opts.sinceMs)

    const rows = await this.db
      .select()
      .from(agentCanaryRun)
      .where(and(eq(agentCanaryRun.tier, opts.tier), gte(agentCanaryRun.runAt, since)))
      .orderBy(desc(agentCanaryRun.runAt))

    return rows.map(toDomain)
  }

  async findRecentByTier(opts: { tier: ModelTier; limit: number }): Promise<CanaryRunEntity[]> {
    const rows = await this.db
      .select()
      .from(agentCanaryRun)
      .where(eq(agentCanaryRun.tier, opts.tier))
      .orderBy(desc(agentCanaryRun.runAt))
      .limit(opts.limit)

    return rows.map(toDomain)
  }
}

export { CANARY_RUN_REPOSITORY }
