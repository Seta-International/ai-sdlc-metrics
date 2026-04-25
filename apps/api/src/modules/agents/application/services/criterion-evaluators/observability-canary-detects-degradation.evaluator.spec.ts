import { describe, it, expect, vi } from 'vitest'
import { ObservabilityCanaryDetectsDegradationEvaluator } from './observability-canary-detects-degradation.evaluator'
import type { CiStatePort } from '../../../domain/ports/ci-state.port'
import type { EvalWindow } from './criterion-evaluator.types'

const WINDOW: EvalWindow = { start: new Date('2026-03-26'), end: new Date('2026-04-25') }

function buildCiState(response: boolean | null): CiStatePort {
  return {
    checkPassed: vi.fn().mockResolvedValue(response),
  }
}

describe('ObservabilityCanaryDetectsDegradationEvaluator', () => {
  it('passes when CI check returns true', async () => {
    const ciState = buildCiState(true)
    const evaluator = new ObservabilityCanaryDetectsDegradationEvaluator(ciState)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(true)
    expect(result.observedValue).toBe('pass')
    expect(result.unableToEvaluate).toBeUndefined()
  })

  it('fails when CI check returns false', async () => {
    const ciState = buildCiState(false)
    const evaluator = new ObservabilityCanaryDetectsDegradationEvaluator(ciState)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.observedValue).toBe('fail')
  })

  it('returns unableToEvaluate when CI state is unknown (null)', async () => {
    const ciState = buildCiState(null)
    const evaluator = new ObservabilityCanaryDetectsDegradationEvaluator(ciState)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.unableToEvaluate).toBe(true)
    expect(result.observedValue).toBe('unknown')
  })

  it('passes the correct checkName to ciState', async () => {
    const ciState = buildCiState(true)
    const evaluator = new ObservabilityCanaryDetectsDegradationEvaluator(ciState)

    await evaluator.evaluate(WINDOW)

    expect(ciState.checkPassed).toHaveBeenCalledWith({
      checkName: 'quarterly-red-team-drill',
      window: WINDOW,
    })
  })

  it('has the correct id and section', () => {
    const ciState = buildCiState(true)
    const evaluator = new ObservabilityCanaryDetectsDegradationEvaluator(ciState)
    expect(evaluator.id).toBe('18.4.canary_detects_planted_degradation')
    expect(evaluator.section).toBe('18.4')
  })
})
