import { Inject, Injectable } from '@nestjs/common'
import type { CriterionEvaluator, CriterionResult, EvalWindow } from './criterion-evaluator.types'
import { CRITERION_THRESHOLDS } from './criterion-thresholds'
import type { CiStatePort } from '../../../domain/ports/ci-state.port'
import { CI_STATE_PORT } from '../../../domain/ports/ci-state.port'

const CRITERION_ID = '18.4.canary_detects_planted_degradation'
const { threshold } = CRITERION_THRESHOLDS[CRITERION_ID]

/**
 * §18.4 — Canary Detects Planted Degradation
 *
 * Checks whether the quarterly red-team drill CI check passed in the window.
 * passed = ciPassed === true
 */
@Injectable()
export class ObservabilityCanaryDetectsDegradationEvaluator implements CriterionEvaluator {
  readonly id = CRITERION_ID
  readonly section = '18.4' as const
  readonly description = CRITERION_THRESHOLDS[CRITERION_ID].description

  constructor(@Inject(CI_STATE_PORT) private readonly ciState: CiStatePort) {}

  async evaluate(window: EvalWindow): Promise<CriterionResult> {
    if (!this.ciState.isEnabled()) {
      return { observedValue: 'unknown', threshold, passed: false, unableToEvaluate: true }
    }

    const result = await this.ciState.checkPassed({
      checkName: 'quarterly-red-team-drill',
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
