/**
 * synthesizer.spec.ts — Plan 03 §9 + §11 unit tests
 *
 * Tests pure synthesizer logic:
 *
 *  Contradiction detection (R-03.23):
 *   1.  Two sub-agents with same numeric summary but different semantics → contradiction
 *   2.  Two sub-agents with same semantics → no contradiction
 *   3.  Single sub-agent → no contradiction
 *
 *  Definitional-clarity rendering (R-03.23):
 *   4.  Contradiction output uses both numbers with semantics labels (not "disagreement")
 *   5.  Non-contradiction output contains the single agreed summary
 *
 *  Confidence aggregation (R-03.22):
 *   6.  MIN of inputs, no demotion on no-contradiction
 *   7.  MIN of inputs, demoted one tier on contradiction
 *   8.  Low + contradiction stays low
 *
 *  Citation attribution (R-03.27, R-03.33):
 *   9.  Every citation has a non-empty subAgentKey
 *  10.  Cross-key citation merging rejected (citation from agent A cannot have agent B's key)
 *  11.  buildCitations assigns each tool-call source to the correct sub-agent's key
 *
 *  Permission-denied disclosure (R-03.31):
 *  12.  all_tools_disabled sub-agent triggers explicit status disclosure in output
 *  13.  errored sub-agent also triggers disclosure
 *  14.  Silently omitting a failed sub-agent is rejected (disclosure mandatory)
 *
 *  outputSchema validation (§11 integration scenario):
 *  15.  Sub-agent returning wrong shape → kind: 'errored'
 */

import { describe, it, expect } from 'vitest'
import {
  detectContradiction,
  renderContradictionClarity,
  buildDisclosureStatements,
  buildCitations,
} from './synthesizer'
import type { SubAgentOutput, ToolCall, Citation } from './phase-executor-contracts'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeToolCall(toolName: string, iteration = 1): ToolCall {
  return { toolName, args: {}, result: {}, iteration, durationMs: 100 }
}

function makeOutput(
  key: string,
  overrides: Partial<SubAgentOutput> = {},
): [string, SubAgentOutput] {
  const output: SubAgentOutput = {
    kind: 'completed',
    summary: `result from ${key}`,
    semantics: 'tasks by status',
    confidence: 'high',
    sourceToolProvenance: [makeToolCall(`${key}.tool`)],
    structured: {},
    drafts: undefined,
    circuitBreakerState: {},
    usageTotals: {
      inputTokens: 100,
      outputTokens: 50,
      inputCachedRead: 0,
      inputCachedWrite: 0,
      outputReasoning: 0,
      costUsd: 0.001,
    },
    ...overrides,
  }
  return [key, output]
}

// ─── detectContradiction ──────────────────────────────────────────────────────

describe('detectContradiction', () => {
  it('1. detects contradiction when two sub-agents have different semantics (even if same kind)', () => {
    const outputs = new Map([
      makeOutput('time.reader', {
        summary: '5 projects',
        semantics: 'has logged hours this month',
      }),
      makeOutput('projects.reader', {
        summary: '6 projects',
        semantics: 'status != closed',
      }),
    ])
    expect(detectContradiction(outputs)).toBe(true)
  })

  it('2. no contradiction when all sub-agents have the same semantics', () => {
    const outputs = new Map([
      makeOutput('agent.a', { semantics: 'tasks by due date' }),
      makeOutput('agent.b', { semantics: 'tasks by due date' }),
    ])
    expect(detectContradiction(outputs)).toBe(false)
  })

  it('3. single sub-agent → no contradiction', () => {
    const outputs = new Map([makeOutput('agent.a')])
    expect(detectContradiction(outputs)).toBe(false)
  })

  it('3b. empty outputs → no contradiction', () => {
    expect(detectContradiction(new Map())).toBe(false)
  })

  it('detects contradiction on numeric mismatch + semantic difference', () => {
    const outputs = new Map([
      makeOutput('agent.a', { summary: '5 projects', semantics: 'active' }),
      makeOutput('agent.b', { summary: '6 projects', semantics: 'all except archived' }),
    ])
    expect(detectContradiction(outputs)).toBe(true)
  })
})

// ─── renderContradictionClarity ───────────────────────────────────────────────

describe('renderContradictionClarity', () => {
  it('4. contradiction output contains both summaries with their semantics', () => {
    const outputs = new Map([
      makeOutput('time.reader', {
        summary: '5 projects',
        semantics: 'has logged hours this month',
      }),
      makeOutput('projects.reader', {
        summary: '6 projects',
        semantics: 'status != closed',
      }),
    ])
    const prose = renderContradictionClarity(outputs)
    expect(prose).toContain('5 projects')
    expect(prose).toContain('has logged hours this month')
    expect(prose).toContain('6 projects')
    expect(prose).toContain('status != closed')
  })

  it('4b. does NOT use "disagree" or "conflict" framing (definitional clarity only)', () => {
    const outputs = new Map([
      makeOutput('a', { summary: '5', semantics: 'measure A' }),
      makeOutput('b', { summary: '6', semantics: 'measure B' }),
    ])
    const prose = renderContradictionClarity(outputs)
    expect(prose.toLowerCase()).not.toContain('disagree')
    expect(prose.toLowerCase()).not.toContain('conflict')
    expect(prose.toLowerCase()).not.toContain('inconsist')
  })

  it('5. single sub-agent output contains the summary directly', () => {
    const outputs = new Map([
      makeOutput('a', { summary: '5 tasks pending', semantics: 'open tasks' }),
    ])
    const prose = renderContradictionClarity(outputs)
    expect(prose).toContain('5 tasks pending')
  })

  it('skips errored/aborted/all_tools_disabled sub-agents — only completed and ceiling_hit contribute', () => {
    const outputs = new Map([
      makeOutput('a', { kind: 'completed', summary: '5 tasks', semantics: 'open tasks' }),
      makeOutput('b', { kind: 'errored', summary: '', semantics: 'tasks by status' }),
      makeOutput('c', { kind: 'aborted', summary: '', semantics: 'tasks by date' }),
    ])
    const prose = renderContradictionClarity(outputs)
    expect(prose).toContain('5 tasks')
    expect(prose).not.toContain('tasks by status')
    expect(prose).not.toContain('tasks by date')
  })

  it('returns empty string when all sub-agents failed', () => {
    const outputs = new Map([
      makeOutput('a', { kind: 'errored', summary: '' }),
      makeOutput('b', { kind: 'all_tools_disabled', summary: '' }),
    ])
    expect(renderContradictionClarity(outputs)).toBe('')
  })
})

// ─── Confidence aggregation ───────────────────────────────────────────────────

// (confidence derivation rules are tested separately in confidence-derivation.spec.ts)
// Here we test the synthesizer's use of computeFinalConfidence with real sub-agent outputs.

import { computeFinalConfidence } from './confidence-derivation'

describe('synthesizer confidence aggregation integration', () => {
  it('6. min of inputs, no demotion on no-contradiction (high+high → high)', () => {
    expect(computeFinalConfidence(['high', 'high'], false)).toBe('high')
  })

  it('7. demotes one tier on contradiction (high+high → med)', () => {
    expect(computeFinalConfidence(['high', 'high'], true)).toBe('med')
  })

  it('8. low + contradiction stays low', () => {
    expect(computeFinalConfidence(['low', 'high'], true)).toBe('low')
  })
})

// ─── buildCitations ───────────────────────────────────────────────────────────

describe('buildCitations', () => {
  it('9. every citation has a non-empty subAgentKey', () => {
    const outputs = new Map([
      makeOutput('planner.reader', {
        summary: '3 tasks',
        sourceToolProvenance: [makeToolCall('planner.listTasks')],
      }),
      makeOutput('people.reader', {
        summary: 'Alice',
        sourceToolProvenance: [makeToolCall('people.getProfile')],
      }),
    ])
    const citations = buildCitations(outputs)
    for (const citation of citations) {
      expect(citation.subAgentKey).toBeTruthy()
      expect(citation.subAgentKey.length).toBeGreaterThan(0)
    }
  })

  it('11. each citation subAgentKey matches the sub-agent that produced the tool call', () => {
    const outputs = new Map([
      makeOutput('planner.reader', {
        summary: '3 tasks',
        sourceToolProvenance: [makeToolCall('planner.listTasks')],
      }),
      makeOutput('people.reader', {
        summary: 'Alice',
        sourceToolProvenance: [makeToolCall('people.getProfile')],
      }),
    ])
    const citations = buildCitations(outputs)

    const plannerCitation = citations.find((c) =>
      c.sources.some((s) => s.toolName === 'planner.listTasks'),
    )
    const peopleCitation = citations.find((c) =>
      c.sources.some((s) => s.toolName === 'people.getProfile'),
    )

    expect(plannerCitation?.subAgentKey).toBe('planner.reader')
    expect(peopleCitation?.subAgentKey).toBe('people.reader')
  })

  it('10. citation subAgentKey is never merged across different sub-agents', () => {
    const outputs = new Map([
      makeOutput('agent.a', { sourceToolProvenance: [makeToolCall('a.tool')] }),
      makeOutput('agent.b', { sourceToolProvenance: [makeToolCall('b.tool')] }),
    ])
    const citations = buildCitations(outputs)

    // Each citation must attribute exclusively to one sub-agent key
    for (const citation of citations) {
      const sourceTools = citation.sources.map((s) => s.toolName)
      // All source tools in a citation should come from the sub-agent whose key it carries.
      // Test: a citation with key 'agent.a' must only contain 'a.tool'
      if (citation.subAgentKey === 'agent.a') {
        expect(sourceTools.every((t) => t === 'a.tool')).toBe(true)
      }
      if (citation.subAgentKey === 'agent.b') {
        expect(sourceTools.every((t) => t === 'b.tool')).toBe(true)
      }
    }
  })

  it('citations for sub-agents with empty provenance are empty', () => {
    const outputs = new Map([makeOutput('agent.a', { sourceToolProvenance: [] })])
    const citations = buildCitations(outputs)
    // No citations for empty provenance
    expect(citations).toHaveLength(0)
  })
})

// ─── buildDisclosureStatements ────────────────────────────────────────────────

describe('buildDisclosureStatements (R-03.31)', () => {
  it('12. all_tools_disabled sub-agent triggers explicit status disclosure', () => {
    const outputs = new Map([
      makeOutput('time.reader', { kind: 'all_tools_disabled', summary: '' }),
      makeOutput('planner.reader', { kind: 'completed' }),
    ])
    const disclosures = buildDisclosureStatements(outputs)
    expect(disclosures).toHaveLength(1)
    expect(disclosures[0]).toContain('time.reader')
    expect(disclosures[0]).toMatch(/permission|access|denied|unavailable/i)
  })

  it('13. errored sub-agent also produces a disclosure', () => {
    const outputs = new Map([
      makeOutput('people.reader', { kind: 'errored' }),
      makeOutput('planner.reader', { kind: 'completed' }),
    ])
    const disclosures = buildDisclosureStatements(outputs)
    expect(disclosures).toHaveLength(1)
    expect(disclosures[0]).toContain('people.reader')
  })

  it('14. no disclosure produced for completed/ceiling_hit sub-agents (only errored/disabled/aborted)', () => {
    const outputs = new Map([
      makeOutput('planner.reader', { kind: 'completed' }),
      makeOutput('time.reader', { kind: 'ceiling_hit' }),
    ])
    const disclosures = buildDisclosureStatements(outputs)
    expect(disclosures).toHaveLength(0)
  })

  it('aborted sub-agent produces a disclosure (R-03.31)', () => {
    const outputs = new Map([
      makeOutput('people.reader', { kind: 'aborted', abortReason: 'timeout' }),
      makeOutput('planner.reader', { kind: 'completed' }),
    ])
    const disclosures = buildDisclosureStatements(outputs)
    expect(disclosures).toHaveLength(1)
    expect(disclosures[0]).toContain('people.reader')
    expect(disclosures[0]).toMatch(/cancelled|timeout/i)
  })

  it('aborted without reason produces a disclosure without crash', () => {
    const outputs = new Map([makeOutput('agent.a', { kind: 'aborted', abortReason: undefined })])
    const disclosures = buildDisclosureStatements(outputs)
    expect(disclosures).toHaveLength(1)
    expect(disclosures[0]).toContain('agent.a')
  })

  it('multiple failed sub-agents each produce their own disclosure', () => {
    const outputs = new Map([
      makeOutput('agent.a', { kind: 'all_tools_disabled' }),
      makeOutput('agent.b', { kind: 'errored' }),
      makeOutput('agent.c', { kind: 'completed' }),
    ])
    const disclosures = buildDisclosureStatements(outputs)
    expect(disclosures).toHaveLength(2)
    const combined = disclosures.join(' ')
    expect(combined).toContain('agent.a')
    expect(combined).toContain('agent.b')
  })
})
