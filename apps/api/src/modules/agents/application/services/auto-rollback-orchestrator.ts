/**
 * auto-rollback-orchestrator.ts — Plan 11 Task 5
 *
 * Performs automatic (or manual) rollback of a canary rollout when regression
 * signals trip their thresholds. Idempotent: calling rollback on an already
 * rolled_back or completed config is a no-op.
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentRolloutConfig, agentRolloutEvent } from '../../infrastructure/schema/agents.schema'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { SignalResult } from './regression-signal-monitor'

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface RollbackOpts {
  rolloutConfigId: string
  /** Signal results from RegressionSignalMonitor. Empty array for manual rollbacks. */
  trippedSignals: SignalResult[]
  triggeredBy: 'auto' | 'manual'
}

// ─── AutoRollbackOrchestrator ─────────────────────────────────────────────────

@Injectable()
export class AutoRollbackOrchestrator {
  private readonly logger = new Logger(AutoRollbackOrchestrator.name)

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly kernelAuditFacade: KernelAuditFacade,
  ) {}

  /**
   * Rolls back the given rollout config to traffic_percentage=0 and status=rolled_back.
   *
   * Idempotent: if the config is already rolled_back or completed, logs a warning and returns.
   * All DB queries are awaited sequentially (single pg.PoolClient per request).
   */
  async rollback(opts: RollbackOpts): Promise<void> {
    // Step 1: Query rollout config
    const [config] = await this.db
      .select()
      .from(agentRolloutConfig)
      .where(eq(agentRolloutConfig.id, opts.rolloutConfigId))
      .limit(1)

    // Step 2: Guard — config not found
    if (!config) {
      this.logger.warn(
        `AutoRollbackOrchestrator: rolloutConfigId=${opts.rolloutConfigId} not found — skipping`,
      )
      return
    }

    // Step 2: Guard — already in terminal state (idempotent)
    if (config.status === 'rolled_back' || config.status === 'completed') {
      this.logger.warn(
        `AutoRollbackOrchestrator: rolloutConfigId=${opts.rolloutConfigId} already in terminal state status=${config.status} — skipping`,
      )
      return
    }

    const fromPercentage = config.trafficPercentage

    // Step 3: Update rollout config
    await this.db
      .update(agentRolloutConfig)
      .set({
        trafficPercentage: '0',
        status: 'rolled_back',
        completedOrRolledBackAt: new Date(),
      })
      .where(eq(agentRolloutConfig.id, opts.rolloutConfigId))

    // Step 4: Compute event metadata
    const eventType =
      opts.triggeredBy === 'auto' ? 'auto_rolled_back' : ('manually_rolled_back' as const)

    const triggeredByValue =
      opts.triggeredBy === 'auto' ? 'auto:regression_monitor' : 'human:manual'

    const reason =
      opts.triggeredBy === 'auto' && opts.trippedSignals.length > 0
        ? opts.trippedSignals.map((s) => `${s.signal}=${s.observed}>${s.threshold}`).join(', ')
        : 'manual rollback'

    // Step 4: Insert rollout event
    await this.db.insert(agentRolloutEvent).values({
      id: uuidv7(),
      rolloutConfigId: opts.rolloutConfigId,
      tenantId: config.tenantId,
      eventType,
      fromPercentage,
      toPercentage: '0',
      reason,
      triggeredBy: triggeredByValue,
    })

    // Step 5: Emit kernel audit
    const auditEventType =
      opts.triggeredBy === 'auto'
        ? 'agent.rollout_auto_rolled_back'
        : 'agent.rollout_manually_rolled_back'

    await this.kernelAuditFacade.recordEvent({
      tenantId: config.tenantId,
      actorId: config.createdBy,
      eventType: auditEventType,
      module: 'agents',
      subjectId: opts.rolloutConfigId,
      payload: {
        trippedSignals: opts.trippedSignals,
        fromPercentage,
      },
    })

    // Step 6: Log
    this.logger.log(
      `AutoRollbackOrchestrator: rolled back rolloutConfigId=${opts.rolloutConfigId} reason=${reason}`,
    )
  }
}
