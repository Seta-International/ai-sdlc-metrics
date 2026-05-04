import { describe, it, expect, vi } from 'vitest'
import { SecurityRlsUnbypassableEvaluator } from './security-rls-unbypassable.evaluator'
import type { CiStatePort } from '../../../domain/ports/ci-state.port'
import type { EvalWindow } from './criterion-evaluator.types'

const WINDOW: EvalWindow = { start: new Date('2026-03-26'), end: new Date('2026-04-25') }

function buildCiState(response: boolean | null): CiStatePort {
  return {
    isEnabled: vi.fn().mockReturnValue(true),
    checkPassed: vi.fn().mockResolvedValue(response),
  }
}

describe('SecurityRlsUnbypassableEvaluator', () => {
  it('passes when CI check passes', async () => {
    const ciState = buildCiState(true)
    const evaluator = new SecurityRlsUnbypassableEvaluator(ciState)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(true)
    expect(result.observedValue).toBe('pass')
    expect(result.unableToEvaluate).toBeUndefined()
  })

  it('fails when CI check fails', async () => {
    const ciState = buildCiState(false)
    const evaluator = new SecurityRlsUnbypassableEvaluator(ciState)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.observedValue).toBe('fail')
    expect(result.unableToEvaluate).toBeUndefined()
  })

  it('returns unableToEvaluate when CI result is unavailable (null)', async () => {
    const ciState = buildCiState(null)
    const evaluator = new SecurityRlsUnbypassableEvaluator(ciState)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.observedValue).toBe('unknown')
    expect(result.unableToEvaluate).toBe(true)
  })

  it('returns unableToEvaluate when port is disabled and does not invoke checkPassed', async () => {
    const ciState: CiStatePort = {
      isEnabled: vi.fn().mockReturnValue(false),
      checkPassed: vi.fn(),
    }
    const evaluator = new SecurityRlsUnbypassableEvaluator(ciState)

    const result = await evaluator.evaluate(WINDOW)

    expect(result.passed).toBe(false)
    expect(result.unableToEvaluate).toBe(true)
    expect(ciState.checkPassed).not.toHaveBeenCalled()
  })

  it('has the correct id and section', () => {
    const ciState = buildCiState(null)
    const evaluator = new SecurityRlsUnbypassableEvaluator(ciState)
    expect(evaluator.id).toBe('18.2.rls_unbypassable_at_domain_boundary')
    expect(evaluator.section).toBe('18.2')
  })
})
