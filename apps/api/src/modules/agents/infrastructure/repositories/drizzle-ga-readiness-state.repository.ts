/**
 * drizzle-ga-readiness-state.repository.ts — Plan 13 Task 2
 *
 * Drizzle-backed implementation of GaReadinessStateRepository.
 *
 * Always upserts the fixed GA_READINESS_SINGLETON_ID row using
 * ON CONFLICT (id) DO UPDATE SET via Drizzle's onConflictDoUpdate.
 */

import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentGaReadinessState } from '../schema/agent-readiness.schema'
import {
  GA_READINESS_STATE_REPOSITORY,
  GA_READINESS_SINGLETON_ID,
  type GaReadinessStateRepository,
  type GaReadinessStateEntity,
} from '../../domain/repositories/ga-readiness-state.repository'

// ─── Row → domain mapper ──────────────────────────────────────────────────────

type AgentGaReadinessStateRow = typeof agentGaReadinessState.$inferSelect

function toDomain(row: AgentGaReadinessStateRow): GaReadinessStateEntity {
  return {
    id: row.id,
    isGaReady: row.isGaReady,
    computedAt: row.computedAt,
    missingCriteria: row.missingCriteria as { criterionId: string; reason: string }[],
    consecutiveWindowsMet: row.consecutiveWindowsMet,
    tenantCount: row.tenantCount,
    interactiveTurnsPerDay: row.interactiveTurnsPerDay,
    p1SecurityIncidentsLast90d: row.p1SecurityIncidentsLast90d,
  }
}

// ─── Repository ───────────────────────────────────────────────────────────────

@Injectable()
export class DrizzleGaReadinessStateRepository implements GaReadinessStateRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async upsert(state: GaReadinessStateEntity): Promise<void> {
    await this.db
      .insert(agentGaReadinessState)
      .values({
        id: GA_READINESS_SINGLETON_ID,
        isGaReady: state.isGaReady,
        computedAt: state.computedAt,
        missingCriteria: state.missingCriteria,
        consecutiveWindowsMet: state.consecutiveWindowsMet,
        tenantCount: state.tenantCount,
        interactiveTurnsPerDay: state.interactiveTurnsPerDay,
        p1SecurityIncidentsLast90d: state.p1SecurityIncidentsLast90d,
      })
      .onConflictDoUpdate({
        target: agentGaReadinessState.id,
        set: {
          isGaReady: state.isGaReady,
          computedAt: state.computedAt,
          missingCriteria: state.missingCriteria,
          consecutiveWindowsMet: state.consecutiveWindowsMet,
          tenantCount: state.tenantCount,
          interactiveTurnsPerDay: state.interactiveTurnsPerDay,
          p1SecurityIncidentsLast90d: state.p1SecurityIncidentsLast90d,
        },
      })
  }

  async get(): Promise<GaReadinessStateEntity | null> {
    const rows = await this.db
      .select()
      .from(agentGaReadinessState)
      .where(eq(agentGaReadinessState.id, GA_READINESS_SINGLETON_ID))
      .limit(1)

    return rows[0] ? toDomain(rows[0]) : null
  }
}

export { GA_READINESS_STATE_REPOSITORY }
