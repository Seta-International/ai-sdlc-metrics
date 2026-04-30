import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, gt } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentCanaryQuery } from '../schema/agents.schema'
import {
  CANARY_QUERY_REPOSITORY,
  type CanaryQueryRepository,
  type CanaryQueryEntity,
  type CanarySource,
  type CanaryQueryStatus,
} from '../../domain/repositories/canary-query.repository'
import type { ModelTier } from '../../domain/scorer-types'

type AgentCanaryQueryRow = typeof agentCanaryQuery.$inferSelect

function toDomain(row: AgentCanaryQueryRow): CanaryQueryEntity {
  return {
    id: row.id,
    tier: row.tier as ModelTier,
    utterance: row.utterance,
    tenantId: row.tenantId,
    expectedAnswerContract: row.expectedAnswerContract as Record<string, unknown>,
    rotationQuarter: row.rotationQuarter,
    source: row.source as CanarySource,
    status: row.status as CanaryQueryStatus,
  }
}

@Injectable()
export class DrizzleCanaryQueryRepository implements CanaryQueryRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findActive(tier: ModelTier): Promise<CanaryQueryEntity[]> {
    const rows = await this.db
      .select()
      .from(agentCanaryQuery)
      .where(and(eq(agentCanaryQuery.tier, tier), eq(agentCanaryQuery.status, 'active')))

    return rows.map(toDomain)
  }

  async findActiveByQuarter(quarter: string): Promise<CanaryQueryEntity[]> {
    const rows = await this.db
      .select()
      .from(agentCanaryQuery)
      .where(
        and(eq(agentCanaryQuery.rotationQuarter, quarter), eq(agentCanaryQuery.status, 'active')),
      )

    return rows.map(toDomain)
  }

  async insertBatch(queries: Omit<CanaryQueryEntity, 'id'>[]): Promise<CanaryQueryEntity[]> {
    if (queries.length === 0) return []

    const rows = await this.db
      .insert(agentCanaryQuery)
      .values(
        queries.map((q) => ({
          tier: q.tier,
          utterance: q.utterance,
          tenantId: q.tenantId,
          expectedAnswerContract: q.expectedAnswerContract,
          rotationQuarter: q.rotationQuarter,
          source: q.source,
          status: q.status,
        })),
      )
      .returning()

    return rows.map(toDomain)
  }

  async retireByQuarter(quarter: string): Promise<number> {
    const rows = await this.db
      .update(agentCanaryQuery)
      .set({ status: 'retired' })
      .where(
        and(eq(agentCanaryQuery.rotationQuarter, quarter), eq(agentCanaryQuery.status, 'active')),
      )
      .returning({ id: agentCanaryQuery.id })

    return rows.length
  }

  async findNextRoundRobin(tier: ModelTier, afterId?: string): Promise<CanaryQueryEntity | null> {
    // If afterId given, find the next active query for the tier after that ID
    if (afterId) {
      const next = await this.db
        .select()
        .from(agentCanaryQuery)
        .where(
          and(
            eq(agentCanaryQuery.tier, tier),
            eq(agentCanaryQuery.status, 'active'),
            gt(agentCanaryQuery.id, afterId),
          ),
        )
        .orderBy(asc(agentCanaryQuery.id))
        .limit(1)

      if (next[0]) return toDomain(next[0])
    }

    // No afterId or no rows after afterId — wrap around to the first active query
    const first = await this.db
      .select()
      .from(agentCanaryQuery)
      .where(and(eq(agentCanaryQuery.tier, tier), eq(agentCanaryQuery.status, 'active')))
      .orderBy(asc(agentCanaryQuery.id))
      .limit(1)

    return first[0] ? toDomain(first[0]) : null
  }
}

export { CANARY_QUERY_REPOSITORY }
