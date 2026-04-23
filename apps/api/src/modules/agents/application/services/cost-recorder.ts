import { Inject, Injectable } from '@nestjs/common'
import { eq, sql } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { OpenAiUsageExtractor } from '../../infrastructure/adapters/openai-usage-extractor'
import {
  agentCostEvents,
  agentTenantBudget,
  agentUserBudget,
} from '../../infrastructure/schema/agents.schema'
import type { Pricing, UsageTokens } from '../../domain/cost/cost-types'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CostRecordOpts {
  traceId: string
  tenantId: string
  userId?: string
  layer: string
  modelId: string
  usage: UsageTokens
  pricing: Pricing
  costUsd: number
  retryCount?: number
  attemptDurationMs?: number
  totalDurationMs?: number
  rawProviderResponse?: unknown
}

// ─── CostRecorder ──────────────────────────────────────────────────────────────

@Injectable()
export class CostRecorder {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly auditFacade: KernelAuditFacade,
    private readonly usageExtractor: OpenAiUsageExtractor,
  ) {}

  async record(opts: CostRecordOpts): Promise<void> {
    // Step 1 — adapter-drop detection (best-effort; audit failure must never abort recording)
    if (opts.rawProviderResponse !== undefined) {
      const dropped = this.usageExtractor.detectDroppedFields(opts.rawProviderResponse, opts.usage)
      if (dropped.length > 0) {
        try {
          await this.auditFacade.recordEvent({
            tenantId: opts.tenantId,
            actorId: opts.tenantId, // system actor — no user context at this layer
            eventType: 'agent.adapter_dropped_cache_fields',
            module: 'agents',
            subjectId: opts.traceId,
            payload: {
              modelId: opts.modelId,
              droppedFields: dropped,
              layer: opts.layer,
            },
          })
        } catch {
          // R-05.6: capture continues even when audit emission fails.
          // The cost event and budget decrement proceed regardless.
        }
      }
    }

    // Step 2 — insert cost event
    await this.db.insert(agentCostEvents).values({
      traceId: opts.traceId,
      tenantId: opts.tenantId,
      userId: opts.userId ?? null,
      pricingId: opts.pricing.pricingId,
      pricedAt: opts.pricing.effectiveFrom,
      modelId: opts.modelId,
      usageInputUncached: opts.usage.inputUncached,
      usageInputCachedRead: opts.usage.inputCachedRead,
      usageInputCachedWrite: opts.usage.inputCachedWrite,
      usageOutput: opts.usage.output,
      usageOutputReasoning: opts.usage.outputReasoning,
      costUsd: String(opts.costUsd),
      layer: opts.layer,
      retryCount: opts.retryCount ?? 0,
      attemptDurationMs: opts.attemptDurationMs ?? 0,
      totalDurationMs: opts.totalDurationMs ?? 0,
    })

    // Step 3 — decrement tenant budget atomically
    await this.db
      .update(agentTenantBudget)
      .set({
        remainingUsd: sql`${agentTenantBudget.remainingUsd} - ${opts.costUsd}`,
        updatedAt: sql`NOW()`,
      })
      .where(eq(agentTenantBudget.tenantId, opts.tenantId))

    // Step 4 — upsert per-user daily budget (only if userId provided)
    if (opts.userId !== undefined) {
      await this.db
        .insert(agentUserBudget)
        .values({
          tenantId: opts.tenantId,
          userId: opts.userId,
          date: sql`CURRENT_DATE`,
          dailyLimitUsd: '0',
          remainingUsd: String(-opts.costUsd),
          updatedAt: sql`NOW()`,
        })
        .onConflictDoUpdate({
          target: [agentUserBudget.tenantId, agentUserBudget.userId, agentUserBudget.date],
          set: {
            remainingUsd: sql`${agentUserBudget.remainingUsd} - ${opts.costUsd}`,
            updatedAt: sql`NOW()`,
          },
        })
    }
  }
}
