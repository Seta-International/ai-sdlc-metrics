import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import type { Job } from 'pg-boss'
import { uuidv7 } from 'uuidv7'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'
import { ShadowDiffScorer, type TurnResult } from '../../application/services/shadow-diff-scorer'
import {
  SHADOW_TURN_JOB_NAME,
  type ShadowTurnJob,
} from '../../application/services/shadow-turn-contracts'
import { agentShadowRun } from '../schema/agents.schema'

// ─── Re-exports for callers that import from this module ──────────────────────

export {
  SHADOW_TURN_JOB_NAME,
  type ShadowTurnJob,
} from '../../application/services/shadow-turn-contracts'

// ─── ShadowTurnWorker ─────────────────────────────────────────────────────────

/**
 * ShadowTurnWorker — Plan 11 Task 3 (Part B)
 *
 * pg-boss worker for queue `agent.shadow-turn`.
 *
 * For each job:
 *   1. Simulate candidate execution (MVP stub — returns null)
 *   2. Score the diff against the baseline output
 *   3. Write an `agent_shadow_run` row
 *
 * Errors are swallowed (shadow is lossy-okay per plan §7). The worker
 * will be upgraded to wire in real turn pipeline execution in a later sub-plan.
 */
@Injectable()
export class ShadowTurnWorker implements OnApplicationBootstrap {
  private readonly logger = new Logger(ShadowTurnWorker.name)

  constructor(
    private readonly pgBossService: PgBossService,
    private readonly diffScorer: ShadowDiffScorer,
    @Inject(DB_TOKEN) private readonly db: Db,
  ) {}

  onApplicationBootstrap(): void {
    this.pgBossService.registerWorker<ShadowTurnJob>(SHADOW_TURN_JOB_NAME, this.handle.bind(this))
  }

  async handle(jobs: Job<ShadowTurnJob>[]): Promise<void> {
    for (const job of jobs) {
      await this.processJob(job)
    }
  }

  private async processJob(job: Job<ShadowTurnJob>): Promise<void> {
    const {
      baselineTraceId,
      baselineOutput,
      candidateVersion,
      baselineVersion,
      rolloutConfigId,
      tenantId,
    } = job.data

    try {
      // Step 1: Simulate candidate shadow execution (MVP stub)
      const candidateOutput = this.simulateShadowExecution()

      // Step 2: Score the diff
      const { score, category } = this.diffScorer.score({ baselineOutput, candidateOutput })

      // Step 3: Generate a unique shadow trace ID
      const shadowTraceId = uuidv7()

      // Step 4: Write agent_shadow_run row
      await this.db.insert(agentShadowRun).values({
        id: uuidv7(),
        tenantId,
        baselineTraceId,
        shadowTraceId,
        rolloutConfigId,
        candidateVersion,
        baselineVersion,
        diffScore: String(score),
        diffCategory: category,
        ts: new Date(),
      })

      this.logger.log(
        `ShadowTurnWorker: shadow run completed trace=${shadowTraceId} category=${category} score=${score}`,
      )
    } catch (err) {
      // Shadow is lossy-okay per plan §7 — log and swallow
      this.logger.error(
        `ShadowTurnWorker: shadow run failed baselineTraceId=${baselineTraceId} tenantId=${tenantId} — ${String(err)}`,
      )
    }
  }

  /**
   * MVP stub for candidate shadow execution.
   *
   * Returns null so the diff scorer categorises the run as 'shadow_errored'.
   * The real execution pipeline will be wired in a later sub-plan once the
   * full turn harness is integrated in the worker context.
   */
  private simulateShadowExecution(): TurnResult | null {
    return null
  }
}
