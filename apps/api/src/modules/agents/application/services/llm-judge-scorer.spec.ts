/**
 * llm-judge-scorer.spec.ts — Plan 10 Task 5
 *
 * Unit tests for LlmJudgeScorer observe-only stub.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LlmJudgeScorer, type TypedPromptTemplate } from './llm-judge-scorer'
import { ScorerRegistry, ScorerRegistrationError } from './scorer-registry'
import type { ReplayedTrace } from '../../domain/scorer-types'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { ScorerRegistrationRepository } from '../../domain/repositories/scorer-registration.repository'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TEST_PROMPT_TEMPLATE: TypedPromptTemplate = {
  system: 'You are a judge evaluating agent responses.',
  userTemplate: 'Trace: {{traceId}}\nInput: {{input}}\nOutput: {{output}}',
  outputSchema: 'score-0-1-with-reason',
}

const DUMMY_REPLAYED_TRACE: ReplayedTrace = {
  traceId: 'trace-001',
  tenantId: 'tenant-001',
  replayResult: {
    messages: [],
    pinnedVersions: {},
    canonicalizerVersionHash: 'abc123',
    missedHashes: undefined as never,
  },
  toolCallsObserved: [],
}

function makeJudgeScorer(
  opts: Partial<ConstructorParameters<typeof LlmJudgeScorer>[0]> = {},
): LlmJudgeScorer {
  return new LlmJudgeScorer({
    id: 'judge-scorer-1',
    name: 'Test LLM Judge Scorer',
    scope: 'test',
    promptTemplate: TEST_PROMPT_TEMPLATE,
    ...opts,
  })
}

function makeRegistry(): {
  registry: ScorerRegistry
  audit: KernelAuditFacade
  scorerRegistrationRepo: ScorerRegistrationRepository
} {
  const audit = {
    recordEvent: vi.fn().mockResolvedValue(undefined),
    publishOutboxEvent: vi.fn().mockResolvedValue(undefined),
    queryAuditLog: vi.fn(),
    exportAuditLog: vi.fn(),
  } as unknown as KernelAuditFacade

  const scorerRegistrationRepo = {
    upsert: vi.fn().mockResolvedValue({}),
    findById: vi.fn().mockResolvedValue(null),
    findAll: vi.fn().mockResolvedValue([]),
    promote: vi.fn().mockResolvedValue(undefined),
    demote: vi.fn().mockResolvedValue(undefined),
  } as unknown as ScorerRegistrationRepository

  const registry = new ScorerRegistry(audit, scorerRegistrationRepo)
  return { registry, audit, scorerRegistrationRepo }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LlmJudgeScorer', () => {
  describe('observe-only stub behaviour', () => {
    it('1. run() always returns { score: 0, passed: true, reason: "observe-only" } regardless of input', async () => {
      const scorer = makeJudgeScorer()

      const result = await scorer.run({
        traceId: 'trace-abc',
        input: DUMMY_REPLAYED_TRACE,
        output: { score: 1, passed: false, reason: 'something' },
      })

      expect(result).toEqual({ score: 0, passed: true, reason: 'observe-only' })
    })

    it('1b. run() returns observe-only even with undefined traceId', async () => {
      const scorer = makeJudgeScorer()

      const result = await scorer.run({
        input: DUMMY_REPLAYED_TRACE,
        output: { score: 1, passed: false, reason: 'some reason' },
      })

      expect(result).toEqual({ score: 0, passed: true, reason: 'observe-only' })
    })

    it('2. kind is "llm-judge"', () => {
      const scorer = makeJudgeScorer()
      expect(scorer.kind).toBe('llm-judge')
    })

    it('3. definitionSource is "code"', () => {
      const scorer = makeJudgeScorer()
      expect(scorer.definitionSource).toBe('code')
    })
  })

  describe('ScorerRegistry integration', () => {
    let registry: ScorerRegistry

    beforeEach(() => {
      registry = makeRegistry().registry
    })

    it('4. Registering with scope "test" → succeeds (no metaEvalAgreement required)', async () => {
      const scorer = makeJudgeScorer({ id: 'judge-test-scope', scope: 'test' })

      await expect(registry.register(scorer)).resolves.not.toThrow()
      expect(registry.findById('judge-test-scope')).toBe(scorer)
    })

    it('5. Registering with scope "trace" without metaEvalAgreement → ScorerRegistrationError thrown', async () => {
      const scorer = makeJudgeScorer({ id: 'judge-trace-no-meta', scope: 'trace' })

      await expect(registry.register(scorer)).rejects.toThrow(ScorerRegistrationError)
      await expect(registry.register(scorer)).rejects.toThrow(
        'LLM-judge scorers with scope other than test require metaEvalAgreement >= 0.95',
      )
    })

    it('6. Registering with scope "trace" with metaEvalAgreement 0.95 → succeeds', async () => {
      const scorer = makeJudgeScorer({
        id: 'judge-trace-with-meta',
        scope: 'trace',
        metaEvalAgreement: 0.95,
      })

      await expect(registry.register(scorer, { metaEvalAgreement: 0.95 })).resolves.not.toThrow()
      expect(registry.findById('judge-trace-with-meta')).toBe(scorer)
    })

    it('7. Registering as role "iterative-topology-exit-gate" → ScorerRegistrationError thrown even with high metaEvalAgreement', async () => {
      const scorer = makeJudgeScorer({
        id: 'judge-exit-gate',
        scope: 'trace',
        metaEvalAgreement: 0.99,
      })

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
  })
})
