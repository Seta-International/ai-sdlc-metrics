/**
 * phase-executor.spec.ts — Plan 03 §5 + §11 unit tests
 *
 * Tests pure-logic functions extracted from the phase executor:
 *
 *  Plan validation:
 *   1. Rejects unknown topology at plan-entry
 *   2. Rejects bounded plan with phase1.length > 3 (R-03.1)
 *   3. Rejects bounded plan with phase2.length > 3 (R-03.37)
 *   4. Accepts bounded plan with phase1=1..3 and phase2=0..3
 *   5. Accepts direct plan with valid fields
 *
 *  Partial-answer gate (R-03.19, R-03.20):
 *   6. ceiling+zero-writes → surface_partial
 *   7. ceiling+drafts → suppress_partial
 *   8. no ceiling hit on any sub-agent → no_ceiling
 *   9. all sub-agents errored (zero writes) → surface_partial
 *
 *  Circuit-breaker context propagation (R-03.18):
 *  10. Phase-2 directive context note includes "Tool X unavailable this turn"
 *  11. Multiple disabled tools all appear in the context note
 *  12. Empty circuit-breaker state produces no context note
 *
 *  Phase-2 per-sub-agent sanitization (R-03.38):
 *  13. projectToSchema runs per phase-2 sub-agent against its own inputSchema
 *  14. Missing key in merged phase1 output throws SchemaMismatchError
 */

import { describe, it, expect } from 'vitest'
import * as z from 'zod'
import {
  validatePlanEntry,
  evaluatePartialAnswerGate,
  buildCircuitBreakerContextNote,
} from './phase-executor'
import { projectToSchema, SchemaMismatchError } from './project-to-schema'
import type { SubAgentOutput, DraftProposal } from './phase-executor-contracts'
import type { RouterPlan } from '../../domain/value-objects/router-plan-schema'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FLOW_ID = '018e8b2a-4c1d-7000-8000-000000000001'

function boundedPlan(phase1Count: number, phase2Count: number): RouterPlan {
  const p1 = Array.from({ length: phase1Count }, (_, i) => ({
    sub_agent_key: `agent.${i}`,
    input: {},
    reason: `r${i}`,
  }))
  const p2 = Array.from({ length: phase2Count }, (_, i) => ({
    sub_agent_key: `phase2-agent.${i}`,
    input: {},
    reason: `p2-${i}`,
  }))
  return {
    topology: 'bounded',
    intent_slug: 'planner.list-my-tasks',
    flow_id: FLOW_ID,
    phase1: p1,
    phase2: p2,
  }
}

function directPlan(): RouterPlan {
  return {
    topology: 'direct',
    toolName: 'planner.personal.listTasks',
    args: { limit: 10 },
    confidence: 0.95,
    intent_slug: 'planner.list-my-tasks',
    flow_id: FLOW_ID,
  }
}

function makeOutput(kind: SubAgentOutput['kind'], hasDrafts = false): SubAgentOutput {
  const draft: DraftProposal = { id: 'd1', toolName: 'planner.createTask', args: {} }
  return {
    kind,
    summary: 'test',
    semantics: 'tasks by status',
    confidence: 'high',
    sourceToolProvenance: [],
    structured: {},
    drafts: hasDrafts ? [draft] : undefined,
    circuitBreakerState: {},
    usageTotals: {
      inputTokens: 100,
      outputTokens: 50,
      inputCachedRead: 0,
      inputCachedWrite: 0,
      outputReasoning: 0,
      costUsd: 0.001,
    },
  }
}

// ─── Plan validation tests ────────────────────────────────────────────────────

describe('validatePlanEntry', () => {
  it('1. accepts bounded plan with phase1=1, phase2=0', () => {
    expect(() => validatePlanEntry(boundedPlan(1, 0))).not.toThrow()
  })

  it('2. rejects bounded plan with phase1.length > 3', () => {
    expect(() => validatePlanEntry(boundedPlan(4, 0))).toThrow(/phase1.*max.*3/i)
  })

  it('3. rejects bounded plan with phase2.length > 3', () => {
    expect(() => validatePlanEntry(boundedPlan(1, 4))).toThrow(/phase2.*max.*3/i)
  })

  it('4a. accepts bounded plan with phase1=3 and phase2=3', () => {
    expect(() => validatePlanEntry(boundedPlan(3, 3))).not.toThrow()
  })

  it('4b. accepts bounded plan with phase1=1 and phase2=0 (no phase 2)', () => {
    expect(() => validatePlanEntry(boundedPlan(1, 0))).not.toThrow()
  })

  it('5. accepts direct plan with valid fields', () => {
    expect(() => validatePlanEntry(directPlan())).not.toThrow()
  })

  it('6. rejects plan with unknown topology', () => {
    const badPlan = { topology: 'unknown', flow_id: FLOW_ID } as unknown as RouterPlan
    expect(() => validatePlanEntry(badPlan)).toThrow(/unknown.*topology/i)
  })
})

// ─── Partial-answer gate tests ────────────────────────────────────────────────

describe('evaluatePartialAnswerGate', () => {
  it('6. ceiling hit + zero writes → surface_partial', () => {
    const outputs = new Map([
      ['a', makeOutput('ceiling_hit', false)],
      ['b', makeOutput('completed', false)],
    ])
    expect(evaluatePartialAnswerGate(outputs)).toBe('surface_partial')
  })

  it('7. ceiling hit + at least one draft → suppress_partial', () => {
    const outputs = new Map([
      ['a', makeOutput('ceiling_hit', false)],
      ['b', makeOutput('completed', true)], // b has a draft
    ])
    expect(evaluatePartialAnswerGate(outputs)).toBe('suppress_partial')
  })

  it('7b. ceiling hit sub-agent itself has draft → suppress_partial', () => {
    const outputs = new Map([['a', makeOutput('ceiling_hit', true)]])
    expect(evaluatePartialAnswerGate(outputs)).toBe('suppress_partial')
  })

  it('8. no ceiling hit on any sub-agent → no_ceiling', () => {
    const outputs = new Map([
      ['a', makeOutput('completed', false)],
      ['b', makeOutput('completed', true)],
    ])
    expect(evaluatePartialAnswerGate(outputs)).toBe('no_ceiling')
  })

  it('8b. errored sub-agent without ceiling → no_ceiling (errored ≠ ceiling_hit)', () => {
    const outputs = new Map([['a', makeOutput('errored', false)]])
    expect(evaluatePartialAnswerGate(outputs)).toBe('no_ceiling')
  })

  it('9. all sub-agents ceiling hit + zero writes → surface_partial', () => {
    const outputs = new Map([
      ['a', makeOutput('ceiling_hit', false)],
      ['b', makeOutput('ceiling_hit', false)],
    ])
    expect(evaluatePartialAnswerGate(outputs)).toBe('surface_partial')
  })

  it('empty map (no sub-agents ran) → no_ceiling', () => {
    expect(evaluatePartialAnswerGate(new Map())).toBe('no_ceiling')
  })
})

// ─── Circuit-breaker context note tests ───────────────────────────────────────

describe('buildCircuitBreakerContextNote', () => {
  it('10. includes disabled tool name in context note', () => {
    const state: Record<string, { disabled: boolean; reason: string }> = {
      'planner.personal.listTasks': { disabled: true, reason: 'failure_threshold' },
    }
    const note = buildCircuitBreakerContextNote(state)
    expect(note).toContain('planner.personal.listTasks')
    expect(note).toContain('unavailable')
  })

  it('11. multiple disabled tools all appear in context note', () => {
    const state: Record<string, { disabled: boolean; reason: string }> = {
      'people.profile.read': { disabled: true, reason: 'failure_threshold' },
      'people.org.read': { disabled: true, reason: 'permission_denied' },
    }
    const note = buildCircuitBreakerContextNote(state)
    expect(note).toContain('people.profile.read')
    expect(note).toContain('people.org.read')
  })

  it('11b. does not include enabled tools in context note', () => {
    const state: Record<string, { disabled: boolean; reason: string }> = {
      'planner.personal.listTasks': { disabled: true, reason: 'failure_threshold' },
      'planner.personal.getTask': { disabled: false, reason: '' },
    }
    const note = buildCircuitBreakerContextNote(state)
    expect(note).toContain('planner.personal.listTasks')
    expect(note).not.toContain('planner.personal.getTask')
  })

  it('12. empty circuit-breaker state produces empty string', () => {
    expect(buildCircuitBreakerContextNote({})).toBe('')
  })

  it('12b. all tools enabled produces empty string', () => {
    const state: Record<string, { disabled: boolean; reason: string }> = {
      'planner.personal.listTasks': { disabled: false, reason: '' },
    }
    expect(buildCircuitBreakerContextNote(state)).toBe('')
  })
})

// ─── Per-sub-agent sanitization tests ────────────────────────────────────────

describe('phase-2 per-sub-agent sanitization (R-03.38)', () => {
  it('13. projectToSchema selects only fields declared in sub-agent inputSchema', () => {
    const phase1Output = { utterance: 'show tasks', taskCount: 5, extra: 'ignored' }
    const inputSchema = z.object({ utterance: z.string(), taskCount: z.number() })
    const result = projectToSchema(phase1Output, inputSchema)
    expect(result).toEqual({ utterance: 'show tasks', taskCount: 5 })
    expect(result).not.toHaveProperty('extra')
  })

  it('13b. each phase-2 sub-agent only sees its own declared fields', () => {
    const phase1Output = {
      utterance: 'query',
      peopleData: { name: 'A' },
      plannerData: { tasks: 3 },
    }
    const schemaA = z.object({
      utterance: z.string(),
      plannerData: z.object({ tasks: z.number() }),
    })
    const schemaB = z.object({ utterance: z.string(), peopleData: z.object({ name: z.string() }) })

    const resultA = projectToSchema(phase1Output, schemaA)
    const resultB = projectToSchema(phase1Output, schemaB)

    expect(resultA).toEqual({ utterance: 'query', plannerData: { tasks: 3 } })
    expect(resultA).not.toHaveProperty('peopleData')

    expect(resultB).toEqual({ utterance: 'query', peopleData: { name: 'A' } })
    expect(resultB).not.toHaveProperty('plannerData')
  })

  it('14. missing key in phase1 output throws SchemaMismatchError', () => {
    const phase1Output = { utterance: 'query' } // missing required 'taskCount'
    const inputSchema = z.object({ utterance: z.string(), taskCount: z.number() })
    expect(() => projectToSchema(phase1Output, inputSchema)).toThrow(SchemaMismatchError)
  })
})
