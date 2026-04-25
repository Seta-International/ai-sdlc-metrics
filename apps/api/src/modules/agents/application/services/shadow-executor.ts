import { Injectable } from '@nestjs/common'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'
import type { TurnResult } from './shadow-diff-scorer'
import { SHADOW_TURN_JOB_NAME } from '../../infrastructure/workers/shadow-turn-worker'

// ─── Option types ─────────────────────────────────────────────────────────────

export interface ShadowShouldOpts {
  rolloutConfig: {
    id: string
    shadowEnabled: boolean
    trafficPercentage: number | string
    status: string
  }
  tenantId: string
  userId?: string
  fromCandidate: boolean
}

export interface ShadowRunOpts {
  baselineTraceId: string
  baselineOutput: TurnResult
  candidateVersion: string
  baselineVersion: string
  rolloutConfigId: string
  tenantId: string
  userId?: string
}

export interface ShadowTurnJob {
  baselineTraceId: string
  baselineOutput: TurnResult
  candidateVersion: string
  baselineVersion: string
  rolloutConfigId: string
  tenantId: string
  userId?: string
}

// ─── ShadowExecutor ───────────────────────────────────────────────────────────

/**
 * ShadowExecutor — Plan 11 Task 3 (Part A)
 *
 * Decides whether to shadow-execute for a given request and, if so,
 * enqueues an `agent.shadow-turn` pg-boss job for async processing.
 *
 * Shadow is fire-and-forget: enqueue does not block the production path.
 */
@Injectable()
export class ShadowExecutor {
  constructor(private readonly pgBossService: PgBossService) {}

  /**
   * Returns true if ALL of:
   *   1. rolloutConfig.status === 'active'
   *   2. rolloutConfig.shadowEnabled === true
   *   3. fromCandidate === true
   *
   * trafficPercentage sampling is intentionally NOT applied here at MVP —
   * the deterministic gate (percentage hash) will be layered on in a later sub-plan
   * once the traffic-split harness is wired end-to-end (R-11.15).
   */
  shouldShadow(opts: ShadowShouldOpts): boolean {
    return (
      opts.rolloutConfig.status === 'active' &&
      opts.rolloutConfig.shadowEnabled === true &&
      opts.fromCandidate === true
    )
  }

  /**
   * Fire-and-forget: enqueues an `agent.shadow-turn` pg-boss job.
   * Does not await job result — shadow processing is fully async and lossy-okay.
   */
  async runShadow(opts: ShadowRunOpts): Promise<void> {
    const job: ShadowTurnJob = {
      baselineTraceId: opts.baselineTraceId,
      baselineOutput: opts.baselineOutput,
      candidateVersion: opts.candidateVersion,
      baselineVersion: opts.baselineVersion,
      rolloutConfigId: opts.rolloutConfigId,
      tenantId: opts.tenantId,
      userId: opts.userId,
    }

    await this.pgBossService.enqueue<ShadowTurnJob>(SHADOW_TURN_JOB_NAME, job)
  }
}
