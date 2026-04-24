/**
 * drizzle-golden-trace.repository.ts — Plan 10 Task 6
 *
 * Drizzle-backed implementation of GoldenTraceRepository.
 *
 * Enforces the ≤20 active rows cap (R-10.11) at insert time.
 * Rows are never hard-deleted — retirement sets removedAt + removalReason (R-10.13).
 */

import { Inject, Injectable } from '@nestjs/common'
import { count, eq, isNull } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentGoldenTrace } from '../schema/agents.schema'
import {
  GOLDEN_TRACE_REPOSITORY,
  type GoldenTraceRepository,
  type GoldenTraceEntity,
} from '../../domain/repositories/golden-trace.repository'
import type { AnswerShape, AdversarialCategory } from '../../domain/scorer-types'

// ─── Cap error ────────────────────────────────────────────────────────────────

export class GoldenTraceCapExceededError extends Error {
  constructor() {
    super(
      'Golden trace set has reached the 20-row limit. Remove an existing trace before adding a new one.',
    )
    this.name = 'GoldenTraceCapExceededError'
  }
}

// ─── Row → domain mapper ──────────────────────────────────────────────────────

type AgentGoldenTraceRow = typeof agentGoldenTrace.$inferSelect

function toDomain(row: AgentGoldenTraceRow): GoldenTraceEntity {
  return {
    id: row.id,
    title: row.title,
    tenantId: row.tenantId,
    seedUserId: row.seedUserId,
    userUtterance: row.userUtterance,
    expectedToolCalls: row.expectedToolCalls as string[],
    expectedShape: row.expectedShape as AnswerShape,
    expectedPermissionKeys: row.expectedPermissionKeys as string[],
    taintExpectation: row.taintExpectation,
    answerShapeContract: row.answerShapeContract as Record<string, unknown>,
    adversarialCategory: (row.adversarialCategory as AdversarialCategory | null) ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    removedAt: row.removedAt ?? null,
    removalReason: row.removalReason ?? null,
  }
}

// ─── Repository ───────────────────────────────────────────────────────────────

@Injectable()
export class DrizzleGoldenTraceRepository implements GoldenTraceRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findActive(): Promise<GoldenTraceEntity[]> {
    const rows = await this.db
      .select()
      .from(agentGoldenTrace)
      .where(isNull(agentGoldenTrace.removedAt))

    return rows.map(toDomain)
  }

  async countActive(): Promise<number> {
    const rows = await this.db
      .select({ total: count() })
      .from(agentGoldenTrace)
      .where(isNull(agentGoldenTrace.removedAt))

    return Number(rows[0]?.total ?? 0)
  }

  async insert(trace: Omit<GoldenTraceEntity, 'id' | 'createdAt'>): Promise<GoldenTraceEntity> {
    const active = await this.countActive()
    if (active >= 20) {
      throw new GoldenTraceCapExceededError()
    }

    const rows = await this.db
      .insert(agentGoldenTrace)
      .values({
        title: trace.title,
        tenantId: trace.tenantId,
        seedUserId: trace.seedUserId,
        userUtterance: trace.userUtterance,
        expectedToolCalls: trace.expectedToolCalls,
        expectedShape: trace.expectedShape,
        expectedPermissionKeys: trace.expectedPermissionKeys,
        taintExpectation: trace.taintExpectation,
        answerShapeContract: trace.answerShapeContract,
        adversarialCategory: trace.adversarialCategory ?? null,
        createdBy: trace.createdBy,
        removedAt: trace.removedAt ?? null,
        removalReason: trace.removalReason ?? null,
      })
      .returning()

    const row = rows[0]
    if (!row) throw new Error('insert returned no rows')
    return toDomain(row)
  }

  async retire(opts: { id: string; removalReason: string; at: Date }): Promise<void> {
    await this.db
      .update(agentGoldenTrace)
      .set({
        removedAt: opts.at,
        removalReason: opts.removalReason,
      })
      .where(eq(agentGoldenTrace.id, opts.id))
  }

  async findById(id: string): Promise<GoldenTraceEntity | null> {
    const rows = await this.db
      .select()
      .from(agentGoldenTrace)
      .where(eq(agentGoldenTrace.id, id))
      .limit(1)

    return rows[0] ? toDomain(rows[0]) : null
  }
}

export { GOLDEN_TRACE_REPOSITORY }
