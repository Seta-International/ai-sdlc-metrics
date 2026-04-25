import { Inject, Injectable } from '@nestjs/common'
import type { CriterionEvaluator, CriterionResult, EvalWindow } from './criterion-evaluator.types'
import { CRITERION_THRESHOLDS } from './criterion-thresholds'
import type { CiStatePort } from '../../../domain/ports/ci-state.port'
import { CI_STATE_PORT } from '../../../domain/ports/ci-state.port'

const CRITERION_ID = '18.5.canary_1_5_25_100_automated'
const { threshold } = CRITERION_THRESHOLDS[CRITERION_ID]

/**
 * §18.5 — Canary 1/5/25/100 Automated Stages
 *
 * Checks whether the canary-stages-automated CI check passed in the window.
 * passed = ciPassed === true
 */
@Injectable()
export class RolloutCanaryStagesEvaluator implements CriterionEvaluator {
  readonly id = CRITERION_ID
  readonly section = '18.5' as const
  readonly description = CRITERION_THRESHOLDS[CRITERION_ID].description

  constructor(@Inject(CI_STATE_PORT) private readonly ciState: CiStatePort) {}

  async evaluate(window: EvalWindow): Promise<CriterionResult> {
    const result = await this.ciState.checkPassed({
      checkName: 'canary-stages-automated',
      window,
    })

    if (result === null) {
      return { observedValue: 'unknown', threshold, passed: false, unableToEvaluate: true }
    }

    return {
      observedValue: result ? 'pass' : 'fail',
      threshold,
      passed: result,
    }
  }
}
