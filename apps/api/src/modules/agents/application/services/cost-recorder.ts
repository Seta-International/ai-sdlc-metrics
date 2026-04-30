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
import {
  recordCostUsd,
  recordUsageTokens,
  recordAdapterDrop,
  setBudgetRemaining,
  recordLlmCallAttemptDuration,
  recordLlmCallTotalDuration,
} from '../../infrastructure/observability/cost-metrics'

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

@Injectable()
export class CostRecorder {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly auditFacade: KernelAuditFacade,
    private readonly usageExtractor: OpenAiUsageExtractor,
  ) {}

  async record(opts: CostRecordOpts): Promise<void> {
    // Adapter-drop detection (best-effort; audit failure must never abort recording).
    if (opts.rawProviderResponse !== undefined) {
      const dropped = this.usageExtractor.detectDroppedFields(opts.rawProviderResponse, opts.usage)
      if (dropped.length > 0) {
        for (const field of dropped) {
          recordAdapterDrop('openai', field)
        }
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
          // Capture continues even when audit emission fails. The cost event
          // and budget decrement proceed regardless.
        }
      }
    }

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

    // Decrement tenant budget atomically; capture the post-deduction
    // remaining amount so the observable gauge can be updated.
    const updatedBudgetRows = await this.db
      .update(agentTenantBudget)
      .set({
        remainingUsd: sql`${agentTenantBudget.remainingUsd} - ${opts.costUsd}`,
        updatedAt: sql`NOW()`,
      })
      .where(eq(agentTenantBudget.tenantId, opts.tenantId))
      .returning({ remainingUsd: agentTenantBudget.remainingUsd })

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

    // Update agent_budget_remaining_usd observable gauge. Only update when the
    // budget row exists (tenant with no budget row is skipped).
    if (updatedBudgetRows.length > 0) {
      const newRemaining = parseFloat(updatedBudgetRows[0]!.remainingUsd as string)
      setBudgetRemaining(opts.tenantId, newRemaining)
    }

    // Emit metrics once per success — never per retry attempt.
    recordCostUsd(opts.tenantId, opts.layer, opts.modelId, opts.pricing.pricingId, opts.costUsd)

    // agent_usage_tokens_total: one data point per non-zero token kind.
    if (opts.usage.inputUncached > 0) {
      recordUsageTokens(opts.tenantId, opts.modelId, 'input_uncached', opts.usage.inputUncached)
    }
    if (opts.usage.inputCachedRead > 0) {
      recordUsageTokens(
        opts.tenantId,
        opts.modelId,
        'input_cached_read',
        opts.usage.inputCachedRead,
      )
    }
    if (opts.usage.inputCachedWrite > 0) {
      recordUsageTokens(
        opts.tenantId,
        opts.modelId,
        'input_cached_write',
        opts.usage.inputCachedWrite,
      )
    }
    if (opts.usage.output > 0) {
      recordUsageTokens(opts.tenantId, opts.modelId, 'output', opts.usage.output)
    }
    if (opts.usage.outputReasoning > 0) {
      recordUsageTokens(opts.tenantId, opts.modelId, 'output_reasoning', opts.usage.outputReasoning)
    }

    // Terminal successful attempt latency SLO.
    if (opts.attemptDurationMs !== undefined && opts.attemptDurationMs > 0) {
      recordLlmCallAttemptDuration(opts.tenantId, opts.modelId, opts.layer, opts.attemptDurationMs)
    }

    // Total including retries — reliability analysis.
    if (opts.totalDurationMs !== undefined && opts.totalDurationMs > 0) {
      recordLlmCallTotalDuration(opts.tenantId, opts.modelId, opts.layer, opts.totalDurationMs)
    }
  }
}
