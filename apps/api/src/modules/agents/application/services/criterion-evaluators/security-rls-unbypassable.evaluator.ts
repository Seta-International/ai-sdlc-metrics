import { Inject, Injectable } from '@nestjs/common'
import type { CriterionEvaluator, CriterionResult, EvalWindow } from './criterion-evaluator.types'
import { CRITERION_THRESHOLDS } from './criterion-thresholds'
import type { CiStatePort } from '../../../domain/ports/ci-state.port'
import { CI_STATE_PORT } from '../../../domain/ports/ci-state.port'

const CRITERION_ID = '18.2.rls_unbypassable_at_domain_boundary'

/**
 * §18.2 — RLS Unbypassable at Domain Boundary
 *
 * Guard liveness is verified by the 'ddd-boundaries' CI check (which lint-checks
 * the ExposureContractGuard wiring). No filesystem check is needed — source files
 * are absent from the compiled dist/ tree at runtime.
 *
 * passed  = CI check passed
 * unknown = CI result unavailable (unableToEvaluate)
 */
@Injectable()
export class SecurityRlsUnbypassableEvaluator implements CriterionEvaluator {
  readonly id = CRITERION_ID
  readonly section = '18.2' as const
  readonly description = CRITERION_THRESHOLDS[CRITERION_ID].description

  constructor(@Inject(CI_STATE_PORT) private readonly ciState: CiStatePort) {}

  async evaluate(window: EvalWindow): Promise<CriterionResult> {
    const threshold = CRITERION_THRESHOLDS[CRITERION_ID].threshold

    if (!this.ciState.isEnabled()) {
      return { observedValue: 'unknown', threshold, passed: false, unableToEvaluate: true }
    }

    const ciPassed = await this.ciState.checkPassed({ checkName: 'ddd-boundaries', window })

    if (ciPassed === null) {
      return { observedValue: 'unknown', threshold, passed: false, unableToEvaluate: true }
    }
    return {
      observedValue: ciPassed ? 'pass' : 'fail',
      threshold,
      passed: ciPassed,
    }
  }
}
