/**
 * router-decision-parser.iterative.spec.ts — Plan 12 Task 5
 *
 * Tests for IterativePlan semantic validation in RouterDecisionParser.
 *
 * Coverage:
 *  1.  Valid iterative plan with deterministic scorerIds → ok
 *  2.  Iterative plan with unknown scorerId → parse_error (router retry)
 *  3.  Iterative plan with llm-judge scorer → parse_error (R-12.10)
 *  4.  Iterative plan with multiple scorers — one unknown → parse_error
 *  5.  Iterative plan with multiple scorers — one llm-judge → parse_error
 *  6.  Iterative plan with empty scorerIds (Zod-blocked) → retry via Zod
 *  7.  parsePlan entry point respects scorer checks
 */

import { describe, it, expect, beforeAll } from 'vitest'
import * as z from 'zod'
import { RouterDecisionParser } from './router-decision-parser'
import { ScorerRegistry } from './scorer-registry'
import { IntentRegistry } from '../../infrastructure/registry/intents/intent-registry'
import { SubAgentRegistry } from '../../infrastructure/registry/sub-agent-registry'
import type { RouterPlan } from '../../domain/value-objects/router-plan-schema'
import { defineSubAgent } from '../../declare'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { ScorerRegistrationRepository } from '../../domain/repositories/scorer-registration.repository'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_TOOL_NAME = 'planner.personal.listTasks'
const VALID_INTENT_SLUG = 'planner.list-my-tasks'
const VALID_SUB_AGENT_KEY = 'planner.read-only'
const VALID_FLOW_ID = '018e8b2a-4c1d-7000-8000-000000000001'

const DETERMINISTIC_SCORER_ID = 'scorer-deterministic-1'
const LLM_JUDGE_SCORER_ID = 'scorer-llm-judge-1'
const UNKNOWN_SCORER_ID = 'scorer-does-not-exist'

class MockToolRegistry {
  getDescriptor(name: string) {
    if (name === MOCK_TOOL_NAME) {
      return { permission: 'planner:tasks:read', name: MOCK_TOOL_NAME }
    }
    return undefined
  }
}

function makeDeterministicScorer(id: string) {
  return {
    id,
    name: `Deterministic Scorer ${id}`,
    kind: 'deterministic' as const,
    scope: 'live' as const,
    definitionSource: 'code' as const,
    run: async () => ({ score: 1 as const, passed: true }),
  }
}

function makeLlmJudgeScorer(id: string) {
  return {
    id,
    name: `LLM Judge Scorer ${id}`,
    kind: 'llm-judge' as const,
    scope: 'test' as const,
    definitionSource: 'code' as const,
    run: async () => ({ score: 1 as const, passed: true }),
  }
}

async function buildRegistries() {
  const intentRegistry = new IntentRegistry()
  intentRegistry.boot([
    { slug: VALID_INTENT_SLUG, domain: 'planner', description: 'List tasks' },
    { slug: 'unclassified', domain: 'agents', description: 'Fallback' },
  ])

  const subAgentRegistry = new SubAgentRegistry()
  const subAgentConfig = defineSubAgent({
    key: VALID_SUB_AGENT_KEY,
    domain: 'planner',
    description: 'Read-only access to tasks.',
    whenToUse: 'Use when the user asks about their tasks or plans.',
    promptTemplate: { body: 'You are a read-only assistant.', variables: z.object({}) },
    inputSchema: z.object({ utterance: z.string() }),
    outputSchema: z.object({ result: z.string() }),
    toolScope: [MOCK_TOOL_NAME],
    budgets: { maxIterations: 4, wallclockMs: 15_000, costUsd: 0.02 },
    memoryScope: { reads: ['L1'], writes: ['L1'] },
    model: { provider: 'openai', model: 'gpt-5.4-nano' },
    source: 'code',
  })
  subAgentRegistry.boot([subAgentConfig], new MockToolRegistry() as never)

  // ScorerRegistry with stubbed audit facade + repo
  const stubAudit = {
    recordEvent: async () => {},
  } as unknown as KernelAuditFacade

  const stubRepo = {
    upsert: async () => ({
      scorerId: '',
      name: '',
      kind: 'deterministic',
      scope: 'live',
      registeredAt: new Date(),
      metaEvalAgreement: null,
      status: 'provisional',
    }),
    demote: async () => {},
    promote: async () => {},
    findAll: async () => [],
    findById: async () => null,
  } as unknown as ScorerRegistrationRepository

  const scorerRegistry = new ScorerRegistry(stubAudit, stubRepo)

  // Register one deterministic scorer
  await scorerRegistry.register(makeDeterministicScorer(DETERMINISTIC_SCORER_ID))

  // Register one llm-judge scorer (scope: 'test' so no metaEvalAgreement required)
  await scorerRegistry.register(makeLlmJudgeScorer(LLM_JUDGE_SCORER_ID))

  return { intentRegistry, subAgentRegistry, scorerRegistry }
}

function validIterativePlan(scorerIds: string[]): RouterPlan {
  return {
    topology: 'iterative',
    intent_slug: VALID_INTENT_SLUG,
    flow_id: VALID_FLOW_ID,
    initialDirective: {
      sub_agent_key: VALID_SUB_AGENT_KEY,
      input: { utterance: 'refine my plan' },
      reason: 'start iterative loop',
    },
    completionCriteria: {
      scorerIds,
      strategy: 'all',
      maxIterations: 3,
      hintToRouter: 'Done when plan looks good',
    },
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RouterDecisionParser — IterativePlan semantic checks (Plan 12 Task 5)', () => {
  let parser: RouterDecisionParser

  beforeAll(async () => {
    const { intentRegistry, subAgentRegistry, scorerRegistry } = await buildRegistries()
    parser = new RouterDecisionParser(intentRegistry, subAgentRegistry, scorerRegistry)
  })

  // ── 1. Valid iterative plan with deterministic scorerIds → ok ──────────────

  it('1. returns ok for a valid iterative plan with a deterministic scorer', () => {
    const plan = validIterativePlan([DETERMINISTIC_SCORER_ID])
    const result = parser.parsePlan(plan)

    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.plan.topology).toBe('iterative')
    }
  })

  it('1b. returns ok for a valid iterative plan JSON with a deterministic scorer', () => {
    const plan = validIterativePlan([DETERMINISTIC_SCORER_ID])
    const result = parser.parseRaw(JSON.stringify(plan))

    expect(result.kind).toBe('ok')
  })

  // ── 2. Iterative plan with unknown scorerId → parse_error (router retry) ────

  it('2. returns retry for an iterative plan with an unknown scorerId', () => {
    const plan = validIterativePlan([UNKNOWN_SCORER_ID])
    const result = parser.parsePlan(plan)

    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      expect(result.reason).toContain(UNKNOWN_SCORER_ID)
      expect(result.reason).toContain('Unknown scorer')
    }
  })

  it('2b. parseRaw also returns retry for unknown scorerId', () => {
    const plan = validIterativePlan([UNKNOWN_SCORER_ID])
    const result = parser.parseRaw(JSON.stringify(plan))

    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      expect(result.reason).toContain(UNKNOWN_SCORER_ID)
    }
  })

  // ── 3. Iterative plan with llm-judge scorer → parse_error (R-12.10) ─────────

  it('3. returns retry for an iterative plan with an llm-judge scorer', () => {
    const plan = validIterativePlan([LLM_JUDGE_SCORER_ID])
    const result = parser.parsePlan(plan)

    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      expect(result.reason).toContain(LLM_JUDGE_SCORER_ID)
      expect(result.reason).toContain('deterministic')
    }
  })

  it('3b. error message mentions R-12.10 rule reference', () => {
    const plan = validIterativePlan([LLM_JUDGE_SCORER_ID])
    const result = parser.parsePlan(plan)

    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      expect(result.reason).toContain('R-12.10')
    }
  })

  // ── 4. Multiple scorers — one unknown → retry ─────────────────────────────

  it('4. returns retry when one of multiple scorerIds is unknown', () => {
    const plan = validIterativePlan([DETERMINISTIC_SCORER_ID, UNKNOWN_SCORER_ID])
    const result = parser.parsePlan(plan)

    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      expect(result.reason).toContain(UNKNOWN_SCORER_ID)
    }
  })

  // ── 5. Multiple scorers — one llm-judge → retry ───────────────────────────

  it('5. returns retry when one of multiple scorerIds is an llm-judge', () => {
    const plan = validIterativePlan([DETERMINISTIC_SCORER_ID, LLM_JUDGE_SCORER_ID])
    const result = parser.parsePlan(plan)

    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      expect(result.reason).toContain(LLM_JUDGE_SCORER_ID)
    }
  })

  // ── 6. Empty scorerIds is blocked by Zod ──────────────────────────────────

  it('6. empty scorerIds is caught by Zod schema validation', () => {
    const planWithEmptyScorers = {
      topology: 'iterative',
      intent_slug: VALID_INTENT_SLUG,
      flow_id: VALID_FLOW_ID,
      initialDirective: {
        sub_agent_key: VALID_SUB_AGENT_KEY,
        input: {},
        reason: 'start loop',
      },
      completionCriteria: {
        scorerIds: [], // empty — violates min(1)
        strategy: 'all',
        maxIterations: 3,
        hintToRouter: 'Done when plan looks good',
      },
    }
    const result = parser.parseRaw(JSON.stringify(planWithEmptyScorers))

    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      expect(result.reason).toContain('schema validation failed')
    }
  })

  // ── 7. parsePlan entry point respects scorer checks ────────────────────────

  it('7. parsePlan entry point validates scorer kinds for iterative plans', () => {
    // Unknown scorer
    const plan1 = validIterativePlan([UNKNOWN_SCORER_ID])
    expect(parser.parsePlan(plan1).kind).toBe('retry')

    // LLM judge scorer
    const plan2 = validIterativePlan([LLM_JUDGE_SCORER_ID])
    expect(parser.parsePlan(plan2).kind).toBe('retry')

    // Valid deterministic scorer
    const plan3 = validIterativePlan([DETERMINISTIC_SCORER_ID])
    expect(parser.parsePlan(plan3).kind).toBe('ok')
  })
})
