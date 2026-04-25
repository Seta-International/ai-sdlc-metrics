/**
 * drizzle-readiness-check.repository.ts — Plan 13 Task 2
 *
 * Drizzle-backed implementation of ReadinessCheckRepository.
 *
 * findAllLatest(): fetches all rows ordered by (criterion_id, window_end DESC),
 * then deduplicates in JS — one row per criterion_id, first occurrence wins.
 * The table stays small (one row per criterion per evaluation window) so
 * in-memory deduplication is acceptable at MVP.
 */

import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, gte } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentReadinessCheck } from '../schema/agent-readiness.schema'
import {
  READINESS_CHECK_REPOSITORY,
  type ReadinessCheckRepository,
  type ReadinessCheckEntity,
} from '../../domain/repositories/readiness-check.repository'

// ─── Row → domain mapper ──────────────────────────────────────────────────────

type AgentReadinessCheckRow = typeof agentReadinessCheck.$inferSelect

function toDomain(row: AgentReadinessCheckRow): ReadinessCheckEntity {
  return {
    id: row.id,
    criterionId: row.criterionId,
    windowStart: row.windowStart,
    windowEnd: row.windowEnd,
    observedValue: row.observedValue,
    threshold: row.threshold,
    passed: row.passed,
    notes: row.notes ?? null,
    computedAt: row.computedAt,
  }
}

// ─── Repository ───────────────────────────────────────────────────────────────

@Injectable()
export class DrizzleReadinessCheckRepository implements ReadinessCheckRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async insert(check: Omit<ReadinessCheckEntity, 'id'>): Promise<ReadinessCheckEntity> {
    const rows = await this.db
      .insert(agentReadinessCheck)
      .values({
        criterionId: check.criterionId,
        windowStart: check.windowStart,
        windowEnd: check.windowEnd,
        observedValue: check.observedValue,
        threshold: check.threshold,
        passed: check.passed,
        notes: check.notes ?? null,
        computedAt: check.computedAt,
      })
      .returning()

    const row = rows[0]
    if (!row) throw new Error('insert returned no rows')
    return toDomain(row)
  }

  async findLatestByCriterion(criterionId: string): Promise<ReadinessCheckEntity | null> {
    const rows = await this.db
      .select()
      .from(agentReadinessCheck)
      .where(eq(agentReadinessCheck.criterionId, criterionId))
      .orderBy(desc(agentReadinessCheck.windowEnd))
      .limit(1)

    return rows[0] ? toDomain(rows[0]) : null
  }

  async findByCriterionSince(criterionId: string, since: Date): Promise<ReadinessCheckEntity[]> {
    const rows = await this.db
      .select()
      .from(agentReadinessCheck)
      .where(
        and(
          eq(agentReadinessCheck.criterionId, criterionId),
          gte(agentReadinessCheck.windowEnd, since),
        ),
      )
      .orderBy(desc(agentReadinessCheck.windowEnd))

    return rows.map(toDomain)
  }

  async findAllLatest(): Promise<ReadinessCheckEntity[]> {
    // Fetch all rows ordered by (criterion_id ASC, window_end DESC).
    // Deduplicate in JS: for each criterion_id, keep only the first (most recent) row.
    const rows = await this.db
      .select()
      .from(agentReadinessCheck)
      .orderBy(agentReadinessCheck.criterionId, desc(agentReadinessCheck.windowEnd))

    const seen = new Set<string>()
    const result: ReadinessCheckEntity[] = []
    for (const row of rows) {
      if (!seen.has(row.criterionId)) {
        seen.add(row.criterionId)
        result.push(toDomain(row))
      }
    }
    return result
  }
}

export { READINESS_CHECK_REPOSITORY }
