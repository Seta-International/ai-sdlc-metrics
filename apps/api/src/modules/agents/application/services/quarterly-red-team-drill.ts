/**
 * QuarterlyRedTeamDrill — Plan 13 Task 6
 *
 * Records and evaluates the outcome of quarterly red-team degradation drills.
 * The actual degradation is planted externally (security team, config flag).
 * This service is a coordination record: operators provide `plantedAt`,
 * `detectedAt`, and `rolledBack` after the canary fires, and `execute()`
 * computes the verdict.
 *
 * Persistence of the drill result into `agent_readiness_check` for criterion
 * `18.4.canary_detects_planted_degradation` is the responsibility of the Task 8
 * worker that calls this service.
 */

import { Injectable } from '@nestjs/common'

export type PlantedDegradationSpec = {
  kind: 'broken_prompt' | 'poisoned_tool_output' | 'regressed_sub_agent'
  duration: { minutes: number }
}

export type DrillResult = {
  quarter: string
  detectedAt?: Date
  detectionLatencyMinutes?: number
  rolledBack: boolean
  outcome: 'passed' | 'failed'
}

@Injectable()
export class QuarterlyRedTeamDrill {
  /**
   * Records the outcome of a red-team drill.
   *
   * A drill passes iff the canary detected the planted degradation (`detectedAt`
   * is set) AND the system was rolled back (`rolledBack = true`).
   *
   * `detectionLatencyMinutes` is the wall-clock minutes from `plantedAt` (when
   * the degradation was introduced) to `detectedAt` (when the canary fired).
   */
  async execute(opts: {
    quarter: string
    tenantId: string
    plantedDegradation: PlantedDegradationSpec
    /** When the degradation was planted. */
    plantedAt: Date
    /** Provided by the operator after the canary fires. */
    detectedAt?: Date
    rolledBack: boolean
  }): Promise<DrillResult> {
    const outcome: 'passed' | 'failed' =
      opts.detectedAt !== undefined && opts.rolledBack ? 'passed' : 'failed'

    const detectionLatencyMinutes =
      opts.detectedAt !== undefined
        ? Math.round((opts.detectedAt.getTime() - opts.plantedAt.getTime()) / 60_000)
        : undefined

    return {
      quarter: opts.quarter,
      detectedAt: opts.detectedAt,
      detectionLatencyMinutes,
      rolledBack: opts.rolledBack,
      outcome,
    }
  }
}
