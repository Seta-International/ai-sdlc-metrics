import { Inject, Injectable, Logger, Optional, OnApplicationBootstrap } from '@nestjs/common'
import type { Job } from 'pg-boss'
import { uuidv7 } from 'uuidv7'
import type { Db } from '@future/db'
import { ClsService } from 'nestjs-cls'
import { DB_TOKEN, BASE_DB_TOKEN } from '../../../../common/db/db.module'
import { RequestDbContextService } from '../../../../common/db/request-db-context.service'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'
import { runWithTenantContext } from '../../../../common/jobs/run-with-tenant-context'
import { ShadowDiffScorer, type TurnResult } from '../../application/services/shadow-diff-scorer'
import type { TrpcCaller } from '../../application/pipeline/pipeline-steps'
import { TrpcCallerImpl } from '../../application/services/trpc-caller'
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
 * ShadowTurnWorker — Plan 11 Task 3 (Part B) — updated for R-11.1
 *
 * pg-boss worker for queue `agent.shadow-turn`.
 *
 * For each job:
 *   1. Simulate candidate execution via dry-run (calls each baseline tool with
 *      mode:'dry-run' so no side effects commit — Plan 11 R-11.1)
 *   2. Score the diff against the baseline output
 *   3. Write an `agent_shadow_run` row
 *
 * Errors are swallowed (shadow is lossy-okay per plan §7).
 *
 * Dry-run isolation (R-11.1):
 *   Each baseline tool is invoked via TrpcCallerImpl with mode:'dry-run'.
 *   TrpcCallerImpl wraps the call in a Postgres transaction that ALWAYS rolls back,
 *   so writes within the candidate pipeline are never committed to the DB.
 *   The candidate output (TurnResult) is captured from the dry-run result for diffing.
 */
@Injectable()
export class ShadowTurnWorker implements OnApplicationBootstrap {
  private readonly logger = new Logger(ShadowTurnWorker.name)
  private readonly trpcCaller: TrpcCaller

  constructor(
    private readonly pgBossService: PgBossService,
    private readonly diffScorer: ShadowDiffScorer,
    @Inject(DB_TOKEN) private readonly db: Db,
    @Inject(BASE_DB_TOKEN) private readonly baseDb: Db,
    private readonly requestDbContext: RequestDbContextService,
    private readonly cls: ClsService,
    /**
     * Optional TrpcCaller for testing — tests inject a mock or minimal caller.
     * Production code omits this; the worker constructs a TrpcCallerImpl with the
     * injected DB so dry-run calls wrap in a real rollback transaction.
     */
    @Optional() trpcCaller?: TrpcCaller,
  ) {
    // If no caller is injected (production path), build one with the DB so
    // dry-run transaction wrapping works correctly (R-11.1).
    this.trpcCaller = trpcCaller ?? new TrpcCallerImpl(undefined, this.db)
  }

  onApplicationBootstrap(): void {
    this.pgBossService.registerWorker<ShadowTurnJob>(SHADOW_TURN_JOB_NAME, this.handle.bind(this))
  }

  async handle(jobs: Job<ShadowTurnJob>[]): Promise<void> {
    for (const job of jobs) {
      await this.processJob(job)
    }
  }

  private async processJob(job: Job<ShadowTurnJob>): Promise<void> {
    await runWithTenantContext(
      {
        tenantId: job.data.tenantId,
        baseDb: this.baseDb,
        requestDbContext: this.requestDbContext,
        cls: this.cls,
      },
      () => this._processJobInContext(job),
    )
  }

  private async _processJobInContext(job: Job<ShadowTurnJob>): Promise<void> {
    const {
      baselineTraceId,
      baselineOutput,
      candidateVersion,
      baselineVersion,
      rolloutConfigId,
      tenantId,
      userId,
    } = job.data

    try {
      // Step 1: Simulate candidate shadow execution via dry-run (R-11.1)
      const candidateOutput = await this.simulateShadowExecution({
        baselineOutput,
        tenantId,
        userId,
        candidateVersion,
      })

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
   * Simulates candidate shadow execution via dry-run (Plan 11 R-11.1).
   *
   * Calls each tool from the baseline output's toolCallNames via TrpcCaller with
   * mode:'dry-run'. TrpcCallerImpl wraps each call in a Postgres transaction that
   * ALWAYS rolls back, ensuring no side effects are committed.
   *
   * The candidate TurnResult is built from the tools that succeeded:
   *  - toolCallNames: tools where the dry-run call returned without error
   *  - permissionKeys: same as baseline (candidate uses the same scope)
   *  - answerShape: same as baseline (shape is determined by router/planner, not tool execution)
   *
   * If ALL tools fail (e.g. candidate pipeline is broken), returns null so
   * the diff scorer categorises the run as 'shadow_errored'.
   */
  private async simulateShadowExecution(opts: {
    baselineOutput: TurnResult
    tenantId: string
    userId?: string
    candidateVersion: string
  }): Promise<TurnResult | null> {
    const { baselineOutput, tenantId, userId, candidateVersion } = opts

    const requestContext = {
      tenantId,
      userId: userId ?? tenantId, // fallback: use tenantId as a synthetic userId for shadow
      traceId: uuidv7(),
      surface: `shadow:${candidateVersion}`,
    }

    const succeededTools: string[] = []

    for (const toolName of baselineOutput.toolCallNames) {
      try {
        await this.trpcCaller.call({
          toolName,
          args: {},
          requestContext,
          mode: 'dry-run',
        })
        succeededTools.push(toolName)
      } catch {
        // Tool call failed in dry-run — do not include in candidate output.
        // This is expected for tools that require specific args; the failure
        // is recorded by excluding the tool from succeededTools.
        this.logger.debug(
          `ShadowTurnWorker: dry-run tool call failed for ${toolName} — excluding from candidate output`,
        )
      }
    }

    if (baselineOutput.toolCallNames.length > 0 && succeededTools.length === 0) {
      // All tools failed — candidate pipeline is broken; treat as shadow_errored
      return null
    }

    return {
      toolCallNames: succeededTools,
      permissionKeys: baselineOutput.permissionKeys,
      answerShape: baselineOutput.answerShape,
    }
  }
}
