/**
 * drizzle-runbook-dry-run.repository.ts — Plan 13 Task 2
 *
 * Drizzle-backed implementation of RunbookDryRunRepository.
 *
 * getCoverage(): fetches rows from the lookback window where outcome is a pass,
 * then builds the coverage record in JS for all 8 known runbook IDs.
 */

import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, gte, inArray } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentRunbookDryRun } from '../schema/agent-readiness.schema'
import {
  RUNBOOK_DRY_RUN_REPOSITORY,
  type RunbookDryRunRepository,
  type RunbookDryRunEntity,
  type RunbookId,
  type RunbookOutcome,
  type RunbookCoverageStatus,
} from '../../domain/repositories/runbook-dry-run.repository'

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_RUNBOOK_IDS: RunbookId[] = [
  'provider_outage',
  'budget_exhaustion_midflight',
  'quality_canary_degradation',
  'cross_tenant_leak_alert',
  'content_hash_store_miss',
  'adapter_dropped_cache_fields',
  'approval_inbox_flood',
  'gdpr_erasure_partial_success',
]

const PASS_OUTCOMES: RunbookOutcome[] = ['pass', 'pass_with_notes']

// ─── Row → domain mapper ──────────────────────────────────────────────────────

type AgentRunbookDryRunRow = typeof agentRunbookDryRun.$inferSelect

function toDomain(row: AgentRunbookDryRunRow): RunbookDryRunEntity {
  return {
    id: row.id,
    tenantId: row.tenantId,
    runbookId: row.runbookId as RunbookId,
    executedAt: row.executedAt,
    executedBy: row.executedBy,
    outcome: row.outcome as RunbookOutcome,
    postMortemUrl: row.postMortemUrl ?? null,
    timeToRecoveryMinutes: row.timeToRecoveryMinutes ?? null,
  }
}

// ─── Repository ───────────────────────────────────────────────────────────────

@Injectable()
export class DrizzleRunbookDryRunRepository implements RunbookDryRunRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async insert(run: Omit<RunbookDryRunEntity, 'id'>): Promise<RunbookDryRunEntity> {
    const rows = await this.db
      .insert(agentRunbookDryRun)
      .values({
        tenantId: run.tenantId,
        runbookId: run.runbookId,
        executedAt: run.executedAt,
        executedBy: run.executedBy,
        outcome: run.outcome,
        postMortemUrl: run.postMortemUrl ?? null,
        timeToRecoveryMinutes: run.timeToRecoveryMinutes ?? null,
      })
      .returning()

    const row = rows[0]
    if (!row) throw new Error('insert returned no rows')
    return toDomain(row)
  }

  async findByRunbookId(
    runbookId: RunbookId,
    opts?: { limit?: number },
  ): Promise<RunbookDryRunEntity[]> {
    const query = this.db
      .select()
      .from(agentRunbookDryRun)
      .where(eq(agentRunbookDryRun.runbookId, runbookId))
      .orderBy(desc(agentRunbookDryRun.executedAt))

    const rows = opts?.limit !== undefined ? await query.limit(opts.limit) : await query

    return rows.map(toDomain)
  }

  async getLastPassByRunbookId(runbookId: RunbookId): Promise<RunbookDryRunEntity | null> {
    const rows = await this.db
      .select()
      .from(agentRunbookDryRun)
      .where(
        and(
          eq(agentRunbookDryRun.runbookId, runbookId),
          inArray(agentRunbookDryRun.outcome, PASS_OUTCOMES),
        ),
      )
      .orderBy(desc(agentRunbookDryRun.executedAt))
      .limit(1)

    return rows[0] ? toDomain(rows[0]) : null
  }

  async getCoverage(opts: {
    lookbackDays: number
  }): Promise<Record<RunbookId, RunbookCoverageStatus>> {
    const since = new Date(Date.now() - opts.lookbackDays * 24 * 60 * 60 * 1000)

    // Initialize all runbook IDs with zero coverage
    const result = Object.fromEntries(
      ALL_RUNBOOK_IDS.map((id) => [id, { lastPassAt: null, passCount: 0 }]),
    ) as Record<RunbookId, RunbookCoverageStatus>

    const rows = await this.db
      .select()
      .from(agentRunbookDryRun)
      .where(
        and(
          gte(agentRunbookDryRun.executedAt, since),
          inArray(agentRunbookDryRun.outcome, PASS_OUTCOMES),
        ),
      )
      .orderBy(desc(agentRunbookDryRun.executedAt))

    for (const row of rows) {
      const runbookId = row.runbookId as RunbookId
      const entry = result[runbookId]
      if (entry === undefined) continue

      entry.passCount += 1
      // rows are ordered desc by executedAt — first occurrence per runbookId is the most recent
      if (entry.lastPassAt === null) {
        entry.lastPassAt = row.executedAt
      }
    }

    return result
  }
}

export { RUNBOOK_DRY_RUN_REPOSITORY }
