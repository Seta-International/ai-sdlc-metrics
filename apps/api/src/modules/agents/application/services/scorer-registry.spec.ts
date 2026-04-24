/**
 * scorer-registry.spec.ts — Plan 10 Task 4
 *
 * Unit tests for ScorerRegistry registration-time enforcement.
 */

import { describe, it, expect, vi } from 'vitest'
import { ScorerRegistry, ScorerRegistrationError } from './scorer-registry'
import type { SetaScorer } from '../../domain/scorer-types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeDeterministicScorer(id = 'det-scorer-1'): SetaScorer {
  return {
    id,
    name: 'Test Deterministic Scorer',
    kind: 'deterministic',
    scope: 'trace',
    definitionSource: 'code',
    run: vi.fn().mockResolvedValue({ score: 1, passed: true }),
  }
}

function makeLlmJudgeScorer(id = 'llm-judge-1', scope: SetaScorer['scope'] = 'test'): SetaScorer {
  return {
    id,
    name: 'Test LLM Judge Scorer',
    kind: 'llm-judge',
    scope,
    definitionSource: 'code',
    run: vi.fn().mockResolvedValue({ score: 0, passed: true, reason: 'observe-only' }),
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ScorerRegistry', () => {
  it('1. register deterministic scorer → succeeds, findById returns it', () => {
    const registry = new ScorerRegistry()
    const scorer = makeDeterministicScorer()

    registry.register(scorer)

    expect(registry.findById(scorer.id)).toBe(scorer)
  })

  it('2. register llm-judge with scope test and no metaEvalAgreement → succeeds', () => {
    const registry = new ScorerRegistry()
    const scorer = makeLlmJudgeScorer('llm-test-scope', 'test')

    expect(() => registry.register(scorer)).not.toThrow()
    expect(registry.findById('llm-test-scope')).toBe(scorer)
  })

  it('3. register llm-judge with scope live and no metaEvalAgreement → throws ScorerRegistrationError', () => {
    const registry = new ScorerRegistry()
    const scorer = makeLlmJudgeScorer('llm-live', 'live')

    expect(() => registry.register(scorer)).toThrow(ScorerRegistrationError)
    expect(() => registry.register(scorer)).toThrow(
      'LLM-judge scorers with scope other than test require metaEvalAgreement >= 0.95',
    )
  })

  it('4. register llm-judge with scope trace and no metaEvalAgreement → throws ScorerRegistrationError', () => {
    const registry = new ScorerRegistry()
    const scorer = makeLlmJudgeScorer('llm-trace', 'trace')

    expect(() => registry.register(scorer)).toThrow(ScorerRegistrationError)
    expect(() => registry.register(scorer)).toThrow(
      'LLM-judge scorers with scope other than test require metaEvalAgreement >= 0.95',
    )
  })

  it('5. register llm-judge with scope trace and metaEvalAgreement 0.95 → succeeds', () => {
    const registry = new ScorerRegistry()
    const scorer = makeLlmJudgeScorer('llm-trace-valid', 'trace')

    expect(() => registry.register(scorer, { metaEvalAgreement: 0.95 })).not.toThrow()
    expect(registry.findById('llm-trace-valid')).toBe(scorer)
  })

  it('6. register llm-judge with scope trace and metaEvalAgreement 0.94 → throws ScorerRegistrationError', () => {
    const registry = new ScorerRegistry()
    const scorer = makeLlmJudgeScorer('llm-trace-low', 'trace')

    expect(() => registry.register(scorer, { metaEvalAgreement: 0.94 })).toThrow(
      ScorerRegistrationError,
    )
    expect(() => registry.register(scorer, { metaEvalAgreement: 0.94 })).toThrow(
      'LLM-judge scorers with scope other than test require metaEvalAgreement >= 0.95',
    )
  })

  it('7. register llm-judge as iterative-topology-exit-gate → throws even with metaEvalAgreement', () => {
    const registry = new ScorerRegistry()
    const scorer = makeLlmJudgeScorer('llm-exit-gate', 'trace')

    expect(() =>
      registry.register(scorer, {
        role: 'iterative-topology-exit-gate',
        metaEvalAgreement: 0.99,
      }),
    ).toThrow(ScorerRegistrationError)
    expect(() =>
      registry.register(scorer, {
        role: 'iterative-topology-exit-gate',
        metaEvalAgreement: 0.99,
      }),
    ).toThrow(
      'LLM-judge scorers cannot be registered as iterative-topology exit gates (§3.1 invariant 4, plan 12)',
    )
  })

  it('8. register duplicate id → throws ScorerRegistrationError', () => {
    const registry = new ScorerRegistry()
    const scorer = makeDeterministicScorer('dup-id')
    const scorerDup = makeDeterministicScorer('dup-id')

    registry.register(scorer)

    expect(() => registry.register(scorerDup)).toThrow(ScorerRegistrationError)
    expect(() => registry.register(scorerDup)).toThrow(
      'Scorer with id dup-id is already registered',
    )
  })

  it('9. getDeterministic() returns only deterministic scorers', () => {
    const registry = new ScorerRegistry()
    const det1 = makeDeterministicScorer('det-1')
    const det2 = makeDeterministicScorer('det-2')
    const llmTest = makeLlmJudgeScorer('llm-test', 'test')

    registry.register(det1)
    registry.register(det2)
    registry.register(llmTest)

    const deterministic = registry.getDeterministic()
    expect(deterministic).toHaveLength(2)
    expect(deterministic.map((s) => s.id)).toEqual(expect.arrayContaining(['det-1', 'det-2']))
    expect(deterministic.every((s) => s.kind === 'deterministic')).toBe(true)
  })

  it('10. getLlmJudge() returns only llm-judge scorers', () => {
    const registry = new ScorerRegistry()
    const det = makeDeterministicScorer('det-only')
    const llm1 = makeLlmJudgeScorer('llm-a', 'test')
    const llm2 = makeLlmJudgeScorer('llm-b', 'test')

    registry.register(det)
    registry.register(llm1)
    registry.register(llm2)

    const llmJudge = registry.getLlmJudge()
    expect(llmJudge).toHaveLength(2)
    expect(llmJudge.map((s) => s.id)).toEqual(expect.arrayContaining(['llm-a', 'llm-b']))
    expect(llmJudge.every((s) => s.kind === 'llm-judge')).toBe(true)
  })
})
