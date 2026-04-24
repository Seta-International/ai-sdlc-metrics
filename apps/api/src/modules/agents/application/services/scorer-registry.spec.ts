/**
 * scorer-registry.spec.ts — Plan 10 Task 4
 *
 * Unit tests for ScorerRegistry registration-time enforcement.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ScorerRegistry, ScorerRegistrationError } from './scorer-registry'
import type { SetaScorer } from '../../domain/scorer-types'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { ScorerRegistrationRepository } from '../../domain/repositories/scorer-registration.repository'

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
  let audit: KernelAuditFacade
  let scorerRegistrationRepo: ScorerRegistrationRepository
  let registry: ScorerRegistry

  beforeEach(() => {
    audit = {
      recordEvent: vi.fn().mockResolvedValue(undefined),
      publishOutboxEvent: vi.fn().mockResolvedValue(undefined),
      queryAuditLog: vi.fn(),
      exportAuditLog: vi.fn(),
    } as unknown as KernelAuditFacade

    scorerRegistrationRepo = {
      upsert: vi.fn().mockResolvedValue({}),
      findById: vi.fn().mockResolvedValue(null),
      findAll: vi.fn().mockResolvedValue([]),
      promote: vi.fn().mockResolvedValue(undefined),
      demote: vi.fn().mockResolvedValue(undefined),
    } as unknown as ScorerRegistrationRepository

    registry = new ScorerRegistry(audit, scorerRegistrationRepo)
  })

  it('1. register deterministic scorer → succeeds, findById returns it', async () => {
    const scorer = makeDeterministicScorer()

    await registry.register(scorer)

    expect(registry.findById(scorer.id)).toBe(scorer)
  })

  it('2. register llm-judge with scope test and no metaEvalAgreement → succeeds', async () => {
    const scorer = makeLlmJudgeScorer('llm-test-scope', 'test')

    await expect(registry.register(scorer)).resolves.not.toThrow()
    expect(registry.findById('llm-test-scope')).toBe(scorer)
  })

  it('3. register llm-judge with scope live and no metaEvalAgreement → throws ScorerRegistrationError', async () => {
    const scorer = makeLlmJudgeScorer('llm-live', 'live')

    await expect(registry.register(scorer)).rejects.toThrow(ScorerRegistrationError)
    await expect(registry.register(scorer)).rejects.toThrow(
      'LLM-judge scorers with scope other than test require metaEvalAgreement >= 0.95',
    )
  })

  it('4. register llm-judge with scope trace and no metaEvalAgreement → throws ScorerRegistrationError', async () => {
    const scorer = makeLlmJudgeScorer('llm-trace', 'trace')

    await expect(registry.register(scorer)).rejects.toThrow(ScorerRegistrationError)
    await expect(registry.register(scorer)).rejects.toThrow(
      'LLM-judge scorers with scope other than test require metaEvalAgreement >= 0.95',
    )
  })

  it('5. register llm-judge with scope trace and metaEvalAgreement 0.95 → succeeds', async () => {
    const scorer = makeLlmJudgeScorer('llm-trace-valid', 'trace')

    await expect(registry.register(scorer, { metaEvalAgreement: 0.95 })).resolves.not.toThrow()
    expect(registry.findById('llm-trace-valid')).toBe(scorer)
  })

  it('6. register llm-judge with scope trace and metaEvalAgreement 0.94 → throws ScorerRegistrationError', async () => {
    const scorer = makeLlmJudgeScorer('llm-trace-low', 'trace')

    await expect(registry.register(scorer, { metaEvalAgreement: 0.94 })).rejects.toThrow(
      ScorerRegistrationError,
    )
    await expect(registry.register(scorer, { metaEvalAgreement: 0.94 })).rejects.toThrow(
      'LLM-judge scorers with scope other than test require metaEvalAgreement >= 0.95',
    )
  })

  it('7. register llm-judge as iterative-topology-exit-gate → throws even with metaEvalAgreement', async () => {
    const scorer = makeLlmJudgeScorer('llm-exit-gate', 'trace')

    await expect(
      registry.register(scorer, {
        role: 'iterative-topology-exit-gate',
        metaEvalAgreement: 0.99,
      }),
    ).rejects.toThrow(ScorerRegistrationError)
    await expect(
      registry.register(scorer, {
        role: 'iterative-topology-exit-gate',
        metaEvalAgreement: 0.99,
      }),
    ).rejects.toThrow(
      'LLM-judge scorers cannot be registered as iterative-topology exit gates (§3.1 invariant 4, plan 12)',
    )
  })

  it('8. register duplicate id → throws ScorerRegistrationError', async () => {
    const scorer = makeDeterministicScorer('dup-id')
    const scorerDup = makeDeterministicScorer('dup-id')

    await registry.register(scorer)

    await expect(registry.register(scorerDup)).rejects.toThrow(ScorerRegistrationError)
    await expect(registry.register(scorerDup)).rejects.toThrow(
      'Scorer with id dup-id is already registered',
    )
  })

  it('9. getDeterministic() returns only deterministic scorers', async () => {
    const det1 = makeDeterministicScorer('det-1')
    const det2 = makeDeterministicScorer('det-2')
    const llmTest = makeLlmJudgeScorer('llm-test', 'test')

    await registry.register(det1)
    await registry.register(det2)
    await registry.register(llmTest)

    const deterministic = registry.getDeterministic()
    expect(deterministic).toHaveLength(2)
    expect(deterministic.map((s) => s.id)).toEqual(expect.arrayContaining(['det-1', 'det-2']))
    expect(deterministic.every((s) => s.kind === 'deterministic')).toBe(true)
  })

  it('10. getLlmJudge() returns only llm-judge scorers', async () => {
    const det = makeDeterministicScorer('det-only')
    const llm1 = makeLlmJudgeScorer('llm-a', 'test')
    const llm2 = makeLlmJudgeScorer('llm-b', 'test')

    await registry.register(det)
    await registry.register(llm1)
    await registry.register(llm2)

    const llmJudge = registry.getLlmJudge()
    expect(llmJudge).toHaveLength(2)
    expect(llmJudge.map((s) => s.id)).toEqual(expect.arrayContaining(['llm-a', 'llm-b']))
    expect(llmJudge.every((s) => s.kind === 'llm-judge')).toBe(true)
  })

  it('11. demote() removes scorer from getDeterministic() and getLlmJudge()', async () => {
    const det = makeDeterministicScorer('det-to-demote')
    const llm = makeLlmJudgeScorer('llm-to-demote', 'test')

    await registry.register(det)
    await registry.register(llm)

    expect(registry.getDeterministic()).toHaveLength(1)
    expect(registry.getLlmJudge()).toHaveLength(1)

    await registry.demote('det-to-demote')
    await registry.demote('llm-to-demote')

    expect(registry.getDeterministic()).toHaveLength(0)
    expect(registry.getLlmJudge()).toHaveLength(0)
    expect(registry.findById('det-to-demote')).toBeUndefined()
    expect(registry.findById('llm-to-demote')).toBeUndefined()
  })
})
