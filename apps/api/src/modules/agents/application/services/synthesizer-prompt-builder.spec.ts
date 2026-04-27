/**
 * synthesizer-prompt-builder.spec.ts — Plan 17 PR 3 Task 10 unit tests
 *
 * Covers:
 *   - buildSynthesizerPrompt: per-sub-agent JSON blocks, disclosures, expectedShape pin,
 *     and skipping of errored/aborted outputs.
 *   - extractExpectedShape: returns null when absent, value when set.
 *   - deriveAggregateConfidence: MIN across completed/ceiling_hit, 'low' on empty,
 *     skips errored/aborted outputs.
 */

import { describe, it, expect } from 'vitest'
import {
  buildSynthesizerPrompt,
  extractExpectedShape,
  deriveAggregateConfidence,
} from './synthesizer-prompt-builder'
import type { SubAgentOutput, SubAgentKey } from './phase-executor-contracts'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function out(overrides: Partial<SubAgentOutput> = {}): SubAgentOutput {
  return {
    kind: 'completed',
    summary: 'default summary',
    semantics: 'default semantics',
    confidence: 'high',
    sourceToolProvenance: [],
    structured: {},
    drafts: undefined,
    circuitBreakerState: {},
    usageTotals: {
      inputTokens: 0,
      outputTokens: 0,
      inputCachedRead: 0,
      inputCachedWrite: 0,
      outputReasoning: 0,
      costUsd: 0,
    },
    ...overrides,
  }
}

function makeMap(
  entries: ReadonlyArray<[SubAgentKey, SubAgentOutput]>,
): ReadonlyMap<SubAgentKey, SubAgentOutput> {
  return new Map(entries)
}

// ─── buildSynthesizerPrompt ───────────────────────────────────────────────────

describe('buildSynthesizerPrompt', () => {
  it('emits a JSON block per completed output with key, summary, and the user utterance', () => {
    const outputs = makeMap([
      ['time.reader', out({ summary: '5 projects', semantics: 'has logged hours this month' })],
      ['projects.reader', out({ summary: '6 projects', semantics: 'status != closed' })],
    ])
    const prompt = buildSynthesizerPrompt({
      allOutputs: outputs,
      disclosures: [],
      hasContradiction: false,
      expectedShape: null,
      userUtterance: 'how many projects am I on?',
    })
    expect(prompt).toContain('"subAgentKey":"time.reader"')
    expect(prompt).toContain('"subAgentKey":"projects.reader"')
    expect(prompt).toContain('5 projects')
    expect(prompt).toContain('6 projects')
    expect(prompt).toContain('how many projects am I on?')
    expect(prompt).toContain('User utterance:')
  })

  it('appends disclosures verbatim with bullet prefixes', () => {
    const prompt = buildSynthesizerPrompt({
      allOutputs: makeMap([['a', out()]]),
      disclosures: ['time.reader: permission denied', 'projects.reader: errored'],
      hasContradiction: false,
      expectedShape: null,
      userUtterance: 'q',
    })
    expect(prompt).toContain('Disclosures (include verbatim in output):')
    expect(prompt).toContain('- time.reader: permission denied')
    expect(prompt).toContain('- projects.reader: errored')
  })

  it('mentions expectedShape when pinned', () => {
    const prompt = buildSynthesizerPrompt({
      allOutputs: makeMap([['a', out()]]),
      disclosures: [],
      hasContradiction: false,
      expectedShape: 'table',
      userUtterance: 'q',
    })
    expect(prompt).toContain('Expected output shape: "table"')
    expect(prompt).toContain('Produce ONLY this shape.')
  })

  it('skips errored and aborted outputs (only completed/ceiling_hit produce blocks)', () => {
    const outputs = makeMap([
      ['ok.agent', out({ summary: 'visible summary' })],
      ['errored.agent', out({ kind: 'errored', summary: 'should not appear' })],
      ['aborted.agent', out({ kind: 'aborted', summary: 'also should not appear' })],
      ['ceiling.agent', out({ kind: 'ceiling_hit', summary: 'partial result, still included' })],
    ])
    const prompt = buildSynthesizerPrompt({
      allOutputs: outputs,
      disclosures: [],
      hasContradiction: false,
      expectedShape: null,
      userUtterance: 'q',
    })
    expect(prompt).toContain('"subAgentKey":"ok.agent"')
    expect(prompt).toContain('"subAgentKey":"ceiling.agent"')
    expect(prompt).not.toContain('errored.agent')
    expect(prompt).not.toContain('aborted.agent')
    expect(prompt).not.toContain('should not appear')
  })

  it('emits the contradiction note when hasContradiction is true', () => {
    const prompt = buildSynthesizerPrompt({
      allOutputs: makeMap([['a', out()]]),
      disclosures: [],
      hasContradiction: true,
      expectedShape: null,
      userUtterance: 'q',
    })
    expect(prompt).toContain('DIFFERENT things')
    expect(prompt).toContain('definitional clarity')
  })
})

// ─── extractExpectedShape ─────────────────────────────────────────────────────

describe('extractExpectedShape', () => {
  it('returns null when directive has no expectedOutputShape field', () => {
    expect(extractExpectedShape({})).toBeNull()
  })

  it('returns null when expectedOutputShape is explicitly null', () => {
    expect(extractExpectedShape({ expectedOutputShape: null })).toBeNull()
  })

  it('returns the shape when set', () => {
    expect(extractExpectedShape({ expectedOutputShape: 'table' })).toBe('table')
    expect(extractExpectedShape({ expectedOutputShape: 'short-answer' })).toBe('short-answer')
  })
})

// ─── deriveAggregateConfidence ────────────────────────────────────────────────

describe('deriveAggregateConfidence', () => {
  it("returns 'high' when all completed outputs are high", () => {
    const outputs = makeMap([
      ['a', out({ confidence: 'high' })],
      ['b', out({ confidence: 'high' })],
    ])
    expect(deriveAggregateConfidence(outputs)).toBe('high')
  })

  it("returns the lowest tier across completed outputs (high + low → 'low')", () => {
    const outputs = makeMap([
      ['a', out({ confidence: 'high' })],
      ['b', out({ confidence: 'low' })],
    ])
    expect(deriveAggregateConfidence(outputs)).toBe('low')
  })

  it("returns 'med' for high + med (no low present)", () => {
    const outputs = makeMap([
      ['a', out({ confidence: 'high' })],
      ['b', out({ confidence: 'med' })],
    ])
    expect(deriveAggregateConfidence(outputs)).toBe('med')
  })

  it("returns 'low' for an empty map", () => {
    expect(deriveAggregateConfidence(new Map())).toBe('low')
  })

  it('skips errored outputs (one completed=high + one errored → high)', () => {
    const outputs = makeMap([
      ['ok', out({ confidence: 'high' })],
      ['bad', out({ kind: 'errored', confidence: 'low' })],
    ])
    expect(deriveAggregateConfidence(outputs)).toBe('high')
  })

  it("returns 'low' when only errored/aborted outputs are present (no completed seen)", () => {
    const outputs = makeMap([
      ['err', out({ kind: 'errored', confidence: 'high' })],
      ['abort', out({ kind: 'aborted', confidence: 'high' })],
    ])
    expect(deriveAggregateConfidence(outputs)).toBe('low')
  })

  it('treats ceiling_hit as a contributing output (ceiling_hit=med + completed=high → med)', () => {
    const outputs = makeMap([
      ['fast', out({ confidence: 'high' })],
      ['slow', out({ kind: 'ceiling_hit', confidence: 'med' })],
    ])
    expect(deriveAggregateConfidence(outputs)).toBe('med')
  })
})
