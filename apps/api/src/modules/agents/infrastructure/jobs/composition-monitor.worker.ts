import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import type PgBoss from 'pg-boss'
import { and, eq, gte, inArray } from 'drizzle-orm'
import { DB_TOKEN, type DrizzleDb } from '@future/db'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { agentToolInvocations } from '../schema/agents.schema'

export interface CompositionMonitorJobData {
  traceId: string
  tenantId: string
  userId: string
  flowId: string
}

/**
 * Empty at MVP — populated when Plan 01 ships tool metadata.
 * Injected via 'COMPOSITION_SENSITIVE_TOOLS' token for testability.
 */
export const DEFAULT_COMPOSITION_SENSITIVE_TOOLS: ReadonlySet<string> = new Set()

export const CROSS_TURN_RATE_THRESHOLD = 5

@Injectable()
export class CompositionMonitorWorker {
  private readonly logger = new Logger(CompositionMonitorWorker.name)

  constructor(
    @Inject(DB_TOKEN) private readonly db: DrizzleDb,
    private readonly auditFacade: KernelAuditFacade,
    @Optional()
    @Inject('COMPOSITION_SENSITIVE_TOOLS')
    private readonly sensitiveTools: ReadonlySet<string> = DEFAULT_COMPOSITION_SENSITIVE_TOOLS,
  ) {}

  async handle(job: PgBoss.Job<CompositionMonitorJobData>): Promise<void> {
    const { traceId, tenantId, userId, flowId } = job.data
    try {
      // Step 1: Query all invocations for this trace (sequential — single pooled client).
      const invocations = await this.db
        .select()
        .from(agentToolInvocations)
        .where(eq(agentToolInvocations.traceId, traceId))

      // Step 2: Filter to composition-sensitive tools.
      const sensitiveToolNames = [...this.sensitiveTools]
      const sensitiveInvocations =
        sensitiveToolNames.length === 0
          ? []
          : invocations.filter((r) => this.sensitiveTools.has(r.toolName))

      if (sensitiveInvocations.length === 0) {
        return
      }

      // Step 3: Turn-level signal — ≥2 invocations with distinct subAgentKey values.
      const distinctSubAgentKeys = new Set(
        sensitiveInvocations.map((r) => r.subAgentKey).filter(Boolean),
      )
      if (distinctSubAgentKeys.size >= 2) {
        await this.emitAuditEvent({
          tenantId,
          userId,
          flowId,
          traceId,
          sensitiveInvocations,
          signal: 'turn_level',
        })
        return
      }

      // Step 4: Cross-turn rate signal — count recent sensitive invocations for tenant.
      const windowStart = new Date(Date.now() - 15 * 60 * 1000)
      const recentInvocations = await this.db
        .select()
        .from(agentToolInvocations)
        .where(
          and(
            eq(agentToolInvocations.tenantId, tenantId),
            eq(agentToolInvocations.userId, userId),
            gte(agentToolInvocations.createdAt, windowStart),
            inArray(agentToolInvocations.toolName, sensitiveToolNames),
          ),
        )

      if (recentInvocations.length >= CROSS_TURN_RATE_THRESHOLD) {
        await this.emitAuditEvent({
          tenantId,
          userId,
          flowId,
          traceId,
          sensitiveInvocations,
          signal: 'cross_turn_rate',
        })
      }
    } catch (err) {
      // Best-effort monitor — swallow errors so this never blocks (Tenet #9).
      this.logger.error(`composition-monitor job failed for traceId=${traceId}`, err)
    }
  }

  private async emitAuditEvent(params: {
    tenantId: string
    userId: string
    flowId: string
    traceId: string
    sensitiveInvocations: Array<{ toolName: string; subAgentKey: string | null }>
    signal: 'turn_level' | 'cross_turn_rate'
  }): Promise<void> {
    const { tenantId, userId, flowId, traceId, sensitiveInvocations, signal } = params
    await this.auditFacade.recordEvent({
      tenantId,
      actorId: userId,
      eventType: 'agent.composition_pattern_observed',
      module: 'agents',
      subjectId: traceId,
      payload: {
        flowId,
        traceId,
        toolNames: sensitiveInvocations.map((r) => r.toolName),
        aggregateDimensions: [
          ...new Set(sensitiveInvocations.map((r) => r.subAgentKey).filter(Boolean)),
        ],
        signal,
      },
    })
  }
}
