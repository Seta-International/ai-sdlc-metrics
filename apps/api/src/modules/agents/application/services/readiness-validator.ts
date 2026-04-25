import { Inject, Injectable } from '@nestjs/common'
import type {
  CriterionEvaluator,
  EvalWindow,
} from './criterion-evaluators/criterion-evaluator.types'
import type { ReadinessCheckRepository } from '../../domain/repositories/readiness-check.repository'
import { READINESS_CHECK_REPOSITORY } from '../../domain/repositories/readiness-check.repository'

export const CRITERION_EVALUATORS = Symbol('CRITERION_EVALUATORS')

export type ReadinessReport = {
  evaluatedAt: Date
  byCriterion: ReadonlyArray<{
    criterionId: string
    passed: boolean
    observedValue: string
    threshold: string
    window: { start: Date; end: Date }
  }>
  allPassed: boolean
  missingCriteria: ReadonlyArray<{ criterionId: string; reason: string }>
}

@Injectable()
export class ReadinessValidator {
  constructor(
    @Inject(CRITERION_EVALUATORS)
    private readonly evaluators: CriterionEvaluator[],
    @Inject(READINESS_CHECK_REPOSITORY)
    private readonly readinessCheckRepository: ReadinessCheckRepository,
  ) {}

  async evaluateAll(window?: EvalWindow): Promise<ReadinessReport> {
    const evaluatedAt = new Date()

    const resolvedWindow: EvalWindow = window ?? {
      start: new Date(evaluatedAt.getTime() - 30 * 24 * 60 * 60 * 1000),
      end: evaluatedAt,
    }

    const byCriterion: Array<{
      criterionId: string
      passed: boolean
      observedValue: string
      threshold: string
      window: { start: Date; end: Date }
    }> = []

    const missingCriteria: Array<{ criterionId: string; reason: string }> = []

    for (const evaluator of this.evaluators) {
      let result
      let errorReason: string | null = null

      try {
        result = await evaluator.evaluate(resolvedWindow)
      } catch (err: unknown) {
        errorReason = err instanceof Error ? err.message : String(err)
      }

      if (errorReason !== null) {
        missingCriteria.push({
          criterionId: evaluator.id,
          reason: `evaluator threw: ${errorReason}`,
        })
        // Intentionally NOT persisting a row — evaluator errors are not criterion failures
        // and must not trigger GA regression signals (plan §7).
        continue
      }

      const passed = result!.passed === true && result!.unableToEvaluate !== true

      await this.readinessCheckRepository.insert({
        criterionId: evaluator.id,
        windowStart: resolvedWindow.start,
        windowEnd: resolvedWindow.end,
        observedValue: result!.observedValue,
        threshold: result!.threshold,
        passed,
        notes: null,
        computedAt: new Date(),
      })

      if (result!.unableToEvaluate === true) {
        missingCriteria.push({ criterionId: evaluator.id, reason: 'data source unavailable' })
      } else {
        byCriterion.push({
          criterionId: evaluator.id,
          passed,
          observedValue: result!.observedValue,
          threshold: result!.threshold,
          window: { start: resolvedWindow.start, end: resolvedWindow.end },
        })
      }
    }

    return {
      evaluatedAt,
      byCriterion,
      allPassed: byCriterion.every((c) => c.passed),
      missingCriteria,
    }
  }
}
