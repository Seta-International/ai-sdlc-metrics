import { describe, it, expect, vi } from 'vitest'
import { RolloutCanaryStagesEvaluator } from './rollout-canary-stages.evaluator'
import type { CiStatePort } from '../../../domain/ports/ci-state.port'
import type { EvalWindow } from './criterion-evaluator.types'

const WINDOW: EvalWindow = { start: new Date('2026-03-26'), end: new Date('2026-04-25') }

function buildCiState(response: boolean | null): CiStatePort {
  return {
    isEnabled: vi.fn().mockReturnValue(true),
    checkPassed: vi.fn().mockResolvedValue(response),
  }
}

describe('RolloutCanaryStagesEvaluator', () => {
  it('passes when CI check returns true', async () => {
    const ciState = buildCiState(true)
    const evaluator = new RolloutCanaryStagesEvaluator(ciState)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(true)
    expect(result.observedValue).toBe('pass')
    expect(result.unableToEvaluate).toBeUndefined()
  })

  it('fails when CI check returns false', async () => {
    const ciState = buildCiState(false)
    const evaluator = new RolloutCanaryStagesEvaluator(ciState)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.observedValue).toBe('fail')
  })

  it('returns unableToEvaluate when CI state is unknown (null)', async () => {
    const ciState = buildCiState(null)
    const evaluator = new RolloutCanaryStagesEvaluator(ciState)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.unableToEvaluate).toBe(true)
    expect(result.observedValue).toBe('unknown')
  })

  it('returns unableToEvaluate when port is disabled and does not invoke checkPassed', async () => {
    const ciState: CiStatePort = {
      isEnabled: vi.fn().mockReturnValue(false),
      checkPassed: vi.fn(),
    }
    const evaluator = new RolloutCanaryStagesEvaluator(ciState)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.unableToEvaluate).toBe(true)
    expect(ciState.checkPassed).not.toHaveBeenCalled()
  })

  it('passes the correct checkName to ciState', async () => {
    const ciState = buildCiState(true)
    const evaluator = new RolloutCanaryStagesEvaluator(ciState)

    await evaluator.evaluate(WINDOW)

    expect(ciState.checkPassed).toHaveBeenCalledWith({
      checkName: 'canary-stages-automated',
      window: WINDOW,
    })
  })

  it('has the correct id and section', () => {
    const ciState = buildCiState(true)
    const evaluator = new RolloutCanaryStagesEvaluator(ciState)
    expect(evaluator.id).toBe('18.5.canary_1_5_25_100_automated')
    expect(evaluator.section).toBe('18.5')
  })
})
