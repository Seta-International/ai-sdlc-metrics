import { Inject, Injectable } from '@nestjs/common'
import type { CriterionEvaluator, CriterionResult, EvalWindow } from './criterion-evaluator.types'
import { CRITERION_THRESHOLDS } from './criterion-thresholds'
import type { CiStatePort } from '../../../domain/ports/ci-state.port'
import { CI_STATE_PORT } from '../../../domain/ports/ci-state.port'

const CRITERION_ID = '18.2.taint_propagates_across_approval'
const { threshold } = CRITERION_THRESHOLDS[CRITERION_ID]

/**
 * §18.2 — Taint Propagates Across Approval
 *
 * Checks whether the E2E taint propagation test passed in the window.
 *
 * result = ciState.checkPassed({ checkName: 'taint-propagation-e2e', window })
 * passed = result === true
 * unableToEvaluate = result === null
 */
@Injectable()
export class SecurityTaintPropagatesApprovalEvaluator implements CriterionEvaluator {
  readonly id = CRITERION_ID
  readonly section = '18.2' as const
  readonly description = CRITERION_THRESHOLDS[CRITERION_ID].description

  constructor(@Inject(CI_STATE_PORT) private readonly ciState: CiStatePort) {}

  async evaluate(window: EvalWindow): Promise<CriterionResult> {
    const result = await this.ciState.checkPassed({
      checkName: 'taint-propagation-e2e',
      window,
    })

    if (result === null) {
      return {
        observedValue: 'unknown',
        threshold,
        passed: false,
        unableToEvaluate: true,
      }
    }

    return {
      observedValue: result ? 'pass' : 'fail',
      threshold,
      passed: result,
    }
  }
}
