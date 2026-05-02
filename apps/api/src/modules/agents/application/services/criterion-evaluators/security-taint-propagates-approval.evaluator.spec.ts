import { describe, it, expect, vi } from 'vitest'
import { SecurityTaintPropagatesApprovalEvaluator } from './security-taint-propagates-approval.evaluator'
import type { CiStatePort } from '../../../domain/ports/ci-state.port'
import type { EvalWindow } from './criterion-evaluator.types'

const WINDOW: EvalWindow = { start: new Date('2026-03-26'), end: new Date('2026-04-25') }

function buildCiState(response: boolean | null): CiStatePort {
  return {
    isEnabled: vi.fn().mockReturnValue(true),
    checkPassed: vi.fn().mockResolvedValue(response),
  }
}

describe('SecurityTaintPropagatesApprovalEvaluator', () => {
  it('passes when E2E taint test passed', async () => {
    const ciState = buildCiState(true)
    const evaluator = new SecurityTaintPropagatesApprovalEvaluator(ciState)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(true)
    expect(result.observedValue).toBe('pass')
    expect(result.unableToEvaluate).toBeUndefined()
  })

  it('fails when E2E taint test failed', async () => {
    const ciState = buildCiState(false)
    const evaluator = new SecurityTaintPropagatesApprovalEvaluator(ciState)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.observedValue).toBe('fail')
  })

  it('returns unableToEvaluate when CI state is unknown', async () => {
    const ciState = buildCiState(null)
    const evaluator = new SecurityTaintPropagatesApprovalEvaluator(ciState)

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
    const evaluator = new SecurityTaintPropagatesApprovalEvaluator(ciState)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.unableToEvaluate).toBe(true)
    expect(ciState.checkPassed).not.toHaveBeenCalled()
  })

  it('passes the correct checkName to ciState', async () => {
    const ciState = buildCiState(true)
    const evaluator = new SecurityTaintPropagatesApprovalEvaluator(ciState)

    await evaluator.evaluate(WINDOW)

    expect(ciState.checkPassed).toHaveBeenCalledWith({
      checkName: 'taint-propagation-e2e',
      window: WINDOW,
    })
  })

  it('has the correct id and section', () => {
    const ciState = buildCiState(null)
    const evaluator = new SecurityTaintPropagatesApprovalEvaluator(ciState)
    expect(evaluator.id).toBe('18.2.taint_propagates_across_approval')
    expect(evaluator.section).toBe('18.2')
  })
})
