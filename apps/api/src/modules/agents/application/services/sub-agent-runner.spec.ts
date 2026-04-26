/**
 * sub-agent-runner.spec.ts — Plan 03 §4 + §11 unit tests
 *
 * Tests the SubAgentRunner's pure helper functions:
 *
 *  DraftProposal taintSource (R-03.32):
 *   1. taintSource is populated when draft produced under tainted turn
 *   2. taintSource is absent when turn is not tainted
 *   3. taintSource records the correct subAgentKey, toolName, fieldName, flippedAtIteration
 *
 *  outputSchema validation (R-03.17):
 *   4. buildSubAgentOutput accepts structured data matching the outputSchema
 *   5. buildSubAgentOutput rejects data that doesn't match outputSchema
 *   6. buildSubAgentOutput returns kind='errored' on schema mismatch (not throws)
 *
 *  Confidence from trace signals (R-03.22) — smoke test that buildSubAgentOutput
 *  calls deriveConfidence; the full rule table is tested in confidence-derivation.spec.ts:
 *   7. No retries + corroborated → kind='completed' + confidence='high'
 *   8. Ceiling hit signal → kind='ceiling_hit' takes precedence over confidence
 */

import { describe, it, expect } from 'vitest'
import * as z from 'zod'
import { buildSubAgentOutput, attachTaintSource } from './sub-agent-runner'
import type { DraftProposal, ConfidenceSignals } from './phase-executor-contracts'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const OUTPUT_SCHEMA = z.object({ taskCount: z.number(), tasks: z.array(z.string()) })

function baseSignals(overrides: Partial<ConfidenceSignals> = {}): ConfidenceSignals {
  return {
    toolResultCount: 1,
    retryCount: 0,
    toolFailureCount: 0,
    taintFlippedDuringRun: false,
    ceilingHit: false,
    semanticConflictWithSibling: false,
    circuitBreakerEventOccurred: false,
    ...overrides,
  }
}

// ─── attachTaintSource tests ─────────────────────────────────────────────────

describe('attachTaintSource', () => {
  const baseDraft: DraftProposal = {
    id: 'draft-1',
    toolName: 'planner.createTask',
    args: { title: 'New task' },
  }

  it('1. populates taintSource when turn is tainted', () => {
    const result = attachTaintSource(baseDraft, {
      isTainted: true,
      subAgentKey: 'planner.writer',
      toolName: 'people.getProfile',
      fieldName: 'bio',
      flippedAtIteration: 2,
    })
    expect(result.taintSource).toBeDefined()
    expect(result.taintSource?.subAgentKey).toBe('planner.writer')
    expect(result.taintSource?.toolName).toBe('people.getProfile')
    expect(result.taintSource?.fieldName).toBe('bio')
    expect(result.taintSource?.flippedAtIteration).toBe(2)
  })

  it('2. taintSource is absent when turn is not tainted', () => {
    const result = attachTaintSource(baseDraft, {
      isTainted: false,
      subAgentKey: 'planner.writer',
      toolName: 'planner.listTasks',
      fieldName: '',
      flippedAtIteration: 0,
    })
    expect(result.taintSource).toBeUndefined()
  })

  it('3. preserves all other DraftProposal fields unchanged', () => {
    const result = attachTaintSource(baseDraft, {
      isTainted: true,
      subAgentKey: 'a',
      toolName: 'b',
      fieldName: 'c',
      flippedAtIteration: 1,
    })
    expect(result.id).toBe('draft-1')
    expect(result.toolName).toBe('planner.createTask')
    expect(result.args).toEqual({ title: 'New task' })
  })
})

// ─── buildSubAgentOutput tests ───────────────────────────────────────────────

describe('buildSubAgentOutput', () => {
  it('4. accepts structured data matching the outputSchema', () => {
    const structured = { taskCount: 3, tasks: ['Task A', 'Task B', 'Task C'] }
    const result = buildSubAgentOutput({
      rawStructured: structured,
      outputSchema: OUTPUT_SCHEMA,
      signals: baseSignals(),
      summary: '3 tasks found',
      semantics: 'open tasks',
      sourceToolProvenance: [],
      circuitBreakerState: {},
    })
    expect(result.kind).toBe('completed')
    expect(result.structured).toEqual(structured)
  })

  it('5. returns kind=errored when structured data fails outputSchema validation', () => {
    const badStructured = { taskCount: 'wrong-type', tasks: 'not-an-array' }
    const result = buildSubAgentOutput({
      rawStructured: badStructured,
      outputSchema: OUTPUT_SCHEMA,
      signals: baseSignals(),
      summary: 'invalid result',
      semantics: 'open tasks',
      sourceToolProvenance: [],
      circuitBreakerState: {},
    })
    expect(result.kind).toBe('errored')
  })

  it('6. does not throw on schema mismatch — returns errored output', () => {
    expect(() =>
      buildSubAgentOutput({
        rawStructured: null,
        outputSchema: OUTPUT_SCHEMA,
        signals: baseSignals(),
        summary: '',
        semantics: '',
        sourceToolProvenance: [],
        circuitBreakerState: {},
      }),
    ).not.toThrow()
  })

  it('7. no retries + corroborated tool result → kind=completed, confidence=high', () => {
    const structured = { taskCount: 1, tasks: ['T1'] }
    const result = buildSubAgentOutput({
      rawStructured: structured,
      outputSchema: OUTPUT_SCHEMA,
      signals: baseSignals({ toolResultCount: 1, retryCount: 0, toolFailureCount: 0 }),
      summary: '1 task',
      semantics: 'open tasks',
      sourceToolProvenance: [],
      circuitBreakerState: {},
    })
    expect(result.kind).toBe('completed')
    expect(result.confidence).toBe('high')
  })

  it('8. ceiling hit signal → kind=ceiling_hit regardless of confidence signals', () => {
    const structured = { taskCount: 2, tasks: ['A', 'B'] }
    const result = buildSubAgentOutput({
      rawStructured: structured,
      outputSchema: OUTPUT_SCHEMA,
      signals: baseSignals({ ceilingHit: true, toolResultCount: 2 }),
      summary: 'partial results',
      semantics: 'open tasks',
      sourceToolProvenance: [],
      circuitBreakerState: {},
    })
    expect(result.kind).toBe('ceiling_hit')
    expect(result.confidence).toBe('low')
  })

  it('propagates summary, semantics, and sourceToolProvenance to output', () => {
    const toolCall = {
      toolName: 'planner.listTasks',
      args: {},
      result: {},
      iteration: 1,
      durationMs: 100,
    }
    const result = buildSubAgentOutput({
      rawStructured: { taskCount: 0, tasks: [] },
      outputSchema: OUTPUT_SCHEMA,
      signals: baseSignals(),
      summary: 'no tasks',
      semantics: 'filtered by due date',
      sourceToolProvenance: [toolCall],
      circuitBreakerState: {},
    })
    expect(result.summary).toBe('no tasks')
    expect(result.semantics).toBe('filtered by due date')
    expect(result.sourceToolProvenance).toHaveLength(1)
    expect(result.sourceToolProvenance[0]!.toolName).toBe('planner.listTasks')
  })

  it('propagates usageTotals through the success branch', () => {
    const usage = {
      inputTokens: 123,
      outputTokens: 456,
      inputCachedRead: 0,
      inputCachedWrite: 0,
      outputReasoning: 7,
      costUsd: 0.0089,
    }
    const out = buildSubAgentOutput({
      rawStructured: { taskCount: 1, tasks: ['T1'] },
      outputSchema: OUTPUT_SCHEMA,
      signals: baseSignals(),
      summary: 's',
      semantics: 'k',
      sourceToolProvenance: [],
      circuitBreakerState: {},
      usageTotals: usage,
    })

    expect(out.kind).toBe('completed')
    expect(out.usageTotals).toEqual(usage)
  })
})
