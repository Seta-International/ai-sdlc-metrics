/**
 * router-decision-parser.spec.ts — Plan 02 Task 9 unit tests
 *
 * Tests use real IntentRegistry + SubAgentRegistry instances (booted with
 * fixtures) rather than stubs, so the semantic checks are exercised with
 * the same code path used in production. No NestJS DI container is started.
 *
 * Covers:
 *  1.  Happy path — valid plan JSON → { kind: 'ok', plan }
 *  2.  Malformed JSON → retry, no fuzzy repair (R-02.22)
 *  3.  Zod fail (missing topology) → retry with reason
 *  4.  Invalid intent_slug (not in IntentRegistry) → retry
 *  5.  Invalid sub_agent_key (not in SubAgentRegistry) → retry
 *  6.  Mutual exclusivity violated (disambiguation + phase1) → retry
 *  7.  Empty phase1 with no disambiguation → retry (semantic cross-field check)
 *  8.  Valid disambiguation-only plan (phase1: []) → ok
 *  9.  parsePlan — semantic-only entry point on a pre-parsed RouterPlan
 * 10.  Escalation — parser never returns { kind: 'escalate' }
 * 11.  schemaInjectedPrompt contains schema fragment + reason
 */

import { describe, it, expect, beforeAll } from 'vitest'
import * as z from 'zod'
import { RouterDecisionParser } from './router-decision-parser'
import { IntentRegistry } from '../../infrastructure/registry/intents/intent-registry'
import { SubAgentRegistry } from '../../infrastructure/registry/sub-agent-registry'
import type { RouterPlan } from '../../domain/value-objects/router-plan-schema'
import { defineSubAgent } from '../../declare'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Mock ToolRegistry so SubAgentRegistry.boot doesn't need the real tool registry.
// The ToolRegistry is only needed to validate toolScope entries at boot time.
// We return a stub descriptor for any tool name so boot passes validation.
const MOCK_TOOL_NAME = 'planner.personal.listTasks'

class MockToolRegistry {
  getDescriptor(name: string) {
    if (name === MOCK_TOOL_NAME) {
      return { permission: 'planner:tasks:read', name: MOCK_TOOL_NAME }
    }
    return undefined
  }
}

const VALID_INTENT_SLUG = 'planner.list-my-tasks'
const VALID_SUB_AGENT_KEY = 'planner.read-only'
const VALID_FLOW_ID = '018e8b2a-4c1d-7000-8000-000000000001'

function buildRegistries() {
  const intentRegistry = new IntentRegistry()
  intentRegistry.boot([
    {
      slug: VALID_INTENT_SLUG,
      domain: 'planner',
      description: 'List tasks for the current user.',
    },
    {
      slug: 'unclassified',
      domain: 'agents',
      description: 'Fallback — no intent matched.',
    },
  ])

  const subAgentRegistry = new SubAgentRegistry()
  const subAgentConfig = defineSubAgent({
    key: VALID_SUB_AGENT_KEY,
    domain: 'planner',
    description: 'Read-only access to tasks, plans, and evidence.',
    whenToUse: 'Use when the user asks about their tasks or plans.',
    promptTemplate: { body: 'You are a read-only assistant.', variables: z.object({}) },
    inputSchema: z.object({ utterance: z.string() }),
    outputSchema: z.object({ result: z.string() }),
    // Use the MOCK_TOOL_NAME that MockToolRegistry recognises.
    // SubAgentRegistry.boot requires non-empty toolScope with every name resolvable.
    toolScope: [MOCK_TOOL_NAME],
    budgets: { maxIterations: 4, wallclockMs: 15_000, costUsd: 0.02 },
    memoryScope: { reads: ['L1'], writes: ['L1'] },
    model: { provider: 'openai', model: 'gpt-5.4-nano' },
    source: 'code',
  })
  // SubAgentRegistry.boot requires non-empty descriptors AND each tool in toolScope
  // to exist in the tool registry. We use empty toolScope to bypass tool checks.
  subAgentRegistry.boot([subAgentConfig], new MockToolRegistry() as never)

  return { intentRegistry, subAgentRegistry }
}

function makeParser() {
  const { intentRegistry, subAgentRegistry } = buildRegistries()
  return new RouterDecisionParser(intentRegistry, subAgentRegistry)
}

// ─── Minimal valid plan helpers ────────────────────────────────────────────────

function validPlanWithPhase1(): RouterPlan {
  return {
    topology: 'bounded',
    intent_slug: VALID_INTENT_SLUG,
    flow_id: VALID_FLOW_ID,
    phase1: [
      {
        sub_agent_key: VALID_SUB_AGENT_KEY,
        input: { utterance: 'show my tasks' },
        reason: 'User asked to list tasks',
      },
    ],
    phase2: [],
  }
}

function validDisambiguationPlan(): RouterPlan {
  return {
    topology: 'bounded',
    intent_slug: VALID_INTENT_SLUG,
    flow_id: VALID_FLOW_ID,
    phase1: [],
    phase2: [],
    disambiguation: 'Did you mean your personal tasks or the team tasks?',
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RouterDecisionParser', () => {
  let parser: RouterDecisionParser

  beforeAll(() => {
    parser = makeParser()
  })

  // ── 1. Happy path ──────────────────────────────────────────────────────────

  it('1. returns ok for a valid plan JSON', () => {
    const plan = validPlanWithPhase1()
    const result = parser.parseRaw(JSON.stringify(plan))

    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.plan.topology).toBe('bounded')
      expect(result.plan.intent_slug).toBe(VALID_INTENT_SLUG)
      expect(result.plan.phase1).toHaveLength(1)
    }
  })

  // ── 2. Malformed JSON ──────────────────────────────────────────────────────

  it('2. returns retry for malformed JSON (no fuzzy repair)', () => {
    // Trailing comma is invalid JSON — no repair should be attempted.
    const malformed = `{"topology": "bounded", "intent_slug": "${VALID_INTENT_SLUG}",}`
    const result = parser.parseRaw(malformed)

    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      expect(result.reason).toContain('malformed JSON')
    }
  })

  it('2b. returns retry for completely non-JSON input', () => {
    const result = parser.parseRaw('I am the router agent and here is my plan...')

    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      expect(result.reason).toContain('malformed JSON')
    }
  })

  // ── 3. Zod validation failure ──────────────────────────────────────────────

  it('3. returns retry when topology is missing (Zod fail)', () => {
    const missingTopology = {
      intent_slug: VALID_INTENT_SLUG,
      flow_id: VALID_FLOW_ID,
      phase1: [{ sub_agent_key: VALID_SUB_AGENT_KEY, input: {}, reason: 'test' }],
    }
    const result = parser.parseRaw(JSON.stringify(missingTopology))

    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      expect(result.reason).toContain('schema validation failed')
    }
  })

  it('3b. returns retry when flow_id is not a UUID (Zod fail)', () => {
    const badFlowId = {
      ...validPlanWithPhase1(),
      flow_id: 'not-a-uuid',
    }
    const result = parser.parseRaw(JSON.stringify(badFlowId))

    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      expect(result.reason).toContain('schema validation failed')
    }
  })

  it('3c. returns retry when topology is wrong enum value (Zod fail)', () => {
    const badTopology = {
      ...validPlanWithPhase1(),
      topology: 'parallel',
    }
    const result = parser.parseRaw(JSON.stringify(badTopology))

    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      expect(result.reason).toContain('schema validation failed')
    }
  })

  // ── 4. Invalid intent_slug ─────────────────────────────────────────────────

  it('4. returns retry when intent_slug is not in IntentRegistry', () => {
    const badSlug = {
      ...validPlanWithPhase1(),
      intent_slug: 'hiring.list-candidates', // valid format but not registered
    }
    const result = parser.parseRaw(JSON.stringify(badSlug))

    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      expect(result.reason).toContain('hiring.list-candidates')
      expect(result.reason).toContain('IntentRegistry')
    }
  })

  it('4b. returns ok for the special "unclassified" slug (registered as fallback)', () => {
    const unclassifiedPlan: RouterPlan = {
      ...validPlanWithPhase1(),
      intent_slug: 'unclassified',
    }
    const result = parser.parseRaw(JSON.stringify(unclassifiedPlan))

    // 'unclassified' is registered in our fixture registry — should pass
    expect(result.kind).toBe('ok')
  })

  // ── 5. Invalid sub_agent_key ───────────────────────────────────────────────

  it('5. returns retry when sub_agent_key is not in SubAgentRegistry', () => {
    const badKey = {
      ...validPlanWithPhase1(),
      phase1: [
        {
          sub_agent_key: 'hiring.interview-scheduler',
          input: {},
          reason: 'schedule interview',
        },
      ],
    }
    const result = parser.parseRaw(JSON.stringify(badKey))

    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      expect(result.reason).toContain('hiring.interview-scheduler')
      expect(result.reason).toContain('SubAgentRegistry')
    }
  })

  it('5b. returns retry when phase2 sub_agent_key is invalid', () => {
    const badPhase2Key: RouterPlan = {
      ...validPlanWithPhase1(),
      phase2: [{ sub_agent_key: 'nonexistent.agent', input: {}, reason: 'follow-up' }],
    }
    const result = parser.parseRaw(JSON.stringify(badPhase2Key))

    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      expect(result.reason).toContain('nonexistent.agent')
    }
  })

  // ── 6. Mutual exclusivity violation ───────────────────────────────────────

  it('6. returns retry when disambiguation + non-empty phase1 coexist', () => {
    const bothSet: RouterPlan = {
      ...validPlanWithPhase1(),
      disambiguation: 'Do you mean personal tasks or team tasks?',
    }
    const result = parser.parseRaw(JSON.stringify(bothSet))

    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      expect(result.reason).toContain('mutual exclusivity')
    }
  })

  it('6b. returns retry when disambiguation + phase2 coexist', () => {
    const withPhase2: RouterPlan = {
      topology: 'bounded',
      intent_slug: VALID_INTENT_SLUG,
      flow_id: VALID_FLOW_ID,
      phase1: [],
      phase2: [{ sub_agent_key: VALID_SUB_AGENT_KEY, input: {}, reason: 'follow up' }],
      disambiguation: 'Do you mean X or Y?',
    }
    const result = parser.parseRaw(JSON.stringify(withPhase2))

    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      expect(result.reason).toContain('mutual exclusivity')
    }
  })

  // ── 7. Empty phase1 with no disambiguation ─────────────────────────────────

  it('7. returns retry when phase1 is empty and disambiguation is absent', () => {
    const emptyPhase1: RouterPlan = {
      topology: 'bounded',
      intent_slug: VALID_INTENT_SLUG,
      flow_id: VALID_FLOW_ID,
      phase1: [],
      phase2: [],
      // no disambiguation
    }
    const result = parser.parseRaw(JSON.stringify(emptyPhase1))

    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      expect(result.reason).toContain('phase1')
      expect(result.reason).toContain('disambiguation')
    }
  })

  // ── 8. Valid disambiguation-only plan ──────────────────────────────────────

  it('8. returns ok for a disambiguation-only plan (empty phase1, empty phase2)', () => {
    const disambiguationPlan = validDisambiguationPlan()
    const result = parser.parseRaw(JSON.stringify(disambiguationPlan))

    expect(result.kind).toBe('ok')
    if (result.kind === 'ok' && result.plan.topology === 'bounded') {
      expect(result.plan.disambiguation).toBe('Did you mean your personal tasks or the team tasks?')
      expect(result.plan.phase1).toHaveLength(0)
      expect(result.plan.phase2).toHaveLength(0)
    }
  })

  // ── 9. parsePlan — semantic-only entry point ───────────────────────────────

  it('9a. parsePlan returns ok for a valid pre-parsed RouterPlan', () => {
    const plan = validPlanWithPhase1()
    const result = parser.parsePlan(plan)

    expect(result.kind).toBe('ok')
  })

  it('9b. parsePlan catches invalid intent_slug without JSON/Zod steps', () => {
    const plan: RouterPlan = {
      ...validPlanWithPhase1(),
      intent_slug: 'finance.nonexistent',
    }
    const result = parser.parsePlan(plan)

    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      expect(result.reason).toContain('finance.nonexistent')
    }
  })

  it('9c. parsePlan catches mutual exclusivity violation', () => {
    const plan: RouterPlan = {
      ...validPlanWithPhase1(),
      disambiguation: 'clarify please',
    }
    const result = parser.parsePlan(plan)

    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      expect(result.reason).toContain('mutual exclusivity')
    }
  })

  it('9d. parsePlan accepts valid disambiguation plan directly', () => {
    const plan = validDisambiguationPlan()
    const result = parser.parsePlan(plan)

    expect(result.kind).toBe('ok')
  })

  // ── 10. Escalation ─────────────────────────────────────────────────────────

  it('10. parser never returns { kind: "escalate" }', () => {
    const inputs = [
      // Valid plan — returns ok
      JSON.stringify(validPlanWithPhase1()),
      // Malformed JSON — returns retry
      'not json',
      // Bad intent_slug — returns retry
      JSON.stringify({ ...validPlanWithPhase1(), intent_slug: 'nonexistent.slug' }),
      // Bad sub_agent_key — returns retry
      JSON.stringify({
        ...validPlanWithPhase1(),
        phase1: [{ sub_agent_key: 'bad.key', input: {}, reason: 'x' }],
      }),
    ]

    for (const input of inputs) {
      const result = parser.parseRaw(input)
      // The union type only has 'ok' | 'retry' — TypeScript ensures this at
      // compile time. This runtime assertion double-checks the invariant.
      expect(['ok', 'retry']).toContain(result.kind)
    }
  })

  // ── 11. schemaInjectedPrompt ───────────────────────────────────────────────

  it('11a. schemaInjectedPrompt contains the JSON schema fragment', () => {
    const result = parser.parseRaw('not json')

    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      // Must contain recognizable pieces of the RouterPlan schema:
      // 'topology' and 'phase1' are always present in the JSON Schema output.
      expect(result.schemaInjectedPrompt).toContain('"topology"')
      expect(result.schemaInjectedPrompt).toContain('"phase1"')
    }
  })

  it('11b. schemaInjectedPrompt contains the specific failure reason', () => {
    const result = parser.parseRaw('not json')

    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      expect(result.schemaInjectedPrompt).toContain(result.reason)
      expect(result.schemaInjectedPrompt).toContain('malformed JSON')
    }
  })

  it('11c. schemaInjectedPrompt instructs no markdown fences', () => {
    const result = parser.parseRaw('not json')

    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      expect(result.schemaInjectedPrompt).toContain('No markdown fences')
    }
  })

  it('11d. schemaInjectedPrompt includes Zod fail reason', () => {
    const missingTopology = {
      intent_slug: VALID_INTENT_SLUG,
      flow_id: VALID_FLOW_ID,
      phase1: [{ sub_agent_key: VALID_SUB_AGENT_KEY, input: {}, reason: 'x' }],
    }
    const result = parser.parseRaw(JSON.stringify(missingTopology))

    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      expect(result.schemaInjectedPrompt).toContain('schema validation failed')
    }
  })

  // ── Additional edge cases ──────────────────────────────────────────────────

  it('returns retry when intent_slug has invalid format (Zod refine)', () => {
    // 'invalid_slug' uses underscores which are not in the allowed character set
    const badFormat = {
      ...validPlanWithPhase1(),
      intent_slug: 'invalid_slug',
    }
    const result = parser.parseRaw(JSON.stringify(badFormat))

    // Zod refine catches this before semantic checks
    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      expect(result.reason).toContain('schema validation failed')
    }
  })

  it('accepts a plan with phase1 + phase2 array and no disambiguation', () => {
    const withBothPhases: RouterPlan = {
      topology: 'bounded',
      intent_slug: VALID_INTENT_SLUG,
      flow_id: VALID_FLOW_ID,
      phase1: [
        {
          sub_agent_key: VALID_SUB_AGENT_KEY,
          input: { utterance: 'my tasks' },
          reason: 'read tasks',
        },
      ],
      phase2: [
        {
          sub_agent_key: VALID_SUB_AGENT_KEY,
          input: { utterance: 'summary' },
          reason: 'summarize results',
        },
      ],
    }
    const result = parser.parseRaw(JSON.stringify(withBothPhases))

    expect(result.kind).toBe('ok')
  })

  it('accepts a bounded plan with phase2 fan-out of 3 sub-agents', () => {
    const fanOut3: RouterPlan = {
      topology: 'bounded',
      intent_slug: VALID_INTENT_SLUG,
      flow_id: VALID_FLOW_ID,
      phase1: [{ sub_agent_key: VALID_SUB_AGENT_KEY, input: { utterance: 'tasks' }, reason: 'r1' }],
      phase2: [
        { sub_agent_key: VALID_SUB_AGENT_KEY, input: { utterance: 'a' }, reason: 'r2' },
        { sub_agent_key: VALID_SUB_AGENT_KEY, input: { utterance: 'b' }, reason: 'r3' },
        { sub_agent_key: VALID_SUB_AGENT_KEY, input: { utterance: 'c' }, reason: 'r4' },
      ],
    }
    const result = parser.parseRaw(JSON.stringify(fanOut3))
    expect(result.kind).toBe('ok')
  })

  it('rejects a plan with phase2 array of 4 sub-agents (Zod max violation)', () => {
    const tooManyPhase2 = {
      topology: 'bounded',
      intent_slug: VALID_INTENT_SLUG,
      flow_id: VALID_FLOW_ID,
      phase1: [{ sub_agent_key: VALID_SUB_AGENT_KEY, input: {}, reason: 'r1' }],
      phase2: [
        { sub_agent_key: VALID_SUB_AGENT_KEY, input: {}, reason: 'r2' },
        { sub_agent_key: VALID_SUB_AGENT_KEY, input: {}, reason: 'r3' },
        { sub_agent_key: VALID_SUB_AGENT_KEY, input: {}, reason: 'r4' },
        { sub_agent_key: VALID_SUB_AGENT_KEY, input: {}, reason: 'r5' }, // 4 > max 3
      ],
    }
    const result = parser.parseRaw(JSON.stringify(tooManyPhase2))
    expect(result.kind).toBe('retry')
    if (result.kind === 'retry') {
      expect(result.reason).toContain('schema validation failed')
    }
  })
})
