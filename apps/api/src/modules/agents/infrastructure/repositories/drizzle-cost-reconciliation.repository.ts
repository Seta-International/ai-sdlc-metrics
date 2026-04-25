/**
 * drizzle-cost-reconciliation.repository.ts — Plan 13 Task 2
 *
 * Drizzle-backed implementation of CostReconciliationRepository.
 *
 * Note: NUMERIC columns (agentCostEventSumUsd, vendorInvoiceSumUsd, divergencePct)
 * are returned by pg as strings. The entity types reflect this.
 */

import { Inject, Injectable } from '@nestjs/common'
import { desc, eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentCostReconciliation } from '../schema/agent-readiness.schema'
import {
  COST_RECONCILIATION_REPOSITORY,
  type CostReconciliationRepository,
  type CostReconciliationEntity,
} from '../../domain/repositories/cost-reconciliation.repository'

// ─── Row → domain mapper ──────────────────────────────────────────────────────

type AgentCostReconciliationRow = typeof agentCostReconciliation.$inferSelect

function toDomain(row: AgentCostReconciliationRow): CostReconciliationEntity {
  return {
    id: row.id,
    weekStart: row.weekStart,
    // NUMERIC columns are returned as strings by pg
    agentCostEventSumUsd: row.agentCostEventSumUsd,
    vendorInvoiceSumUsd: row.vendorInvoiceSumUsd,
    divergencePct: row.divergencePct,
    divergenceOverThreshold: row.divergenceOverThreshold,
    computedAt: row.computedAt,
  }
}

// ─── Repository ───────────────────────────────────────────────────────────────

@Injectable()
export class DrizzleCostReconciliationRepository implements CostReconciliationRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async insert(rec: Omit<CostReconciliationEntity, 'id'>): Promise<CostReconciliationEntity> {
    const rows = await this.db
      .insert(agentCostReconciliation)
      .values({
        weekStart: rec.weekStart,
        agentCostEventSumUsd: rec.agentCostEventSumUsd,
        vendorInvoiceSumUsd: rec.vendorInvoiceSumUsd,
        divergencePct: rec.divergencePct,
        divergenceOverThreshold: rec.divergenceOverThreshold,
        computedAt: rec.computedAt,
      })
      .returning()

    const row = rows[0]
    if (!row) throw new Error('insert returned no rows')
    return toDomain(row)
  }

  async findByWeekStart(weekStart: string): Promise<CostReconciliationEntity | null> {
    const rows = await this.db
      .select()
      .from(agentCostReconciliation)
      .where(eq(agentCostReconciliation.weekStart, weekStart))
      .limit(1)

    return rows[0] ? toDomain(rows[0]) : null
  }

  async findRecent(opts?: { limit?: number }): Promise<CostReconciliationEntity[]> {
    const query = this.db
      .select()
      .from(agentCostReconciliation)
      .orderBy(desc(agentCostReconciliation.weekStart))

    const rows = opts?.limit !== undefined ? await query.limit(opts.limit) : await query

    return rows.map(toDomain)
  }
}

export { COST_RECONCILIATION_REPOSITORY }
