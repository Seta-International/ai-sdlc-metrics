/**
 * render-answer.spec.ts — Plan 18 Task 6
 *
 * Pure helpers consumed by the live turn pipeline:
 *   - renderAnswerToMarkdown: SynthesizerOutput → markdown for conversation persistence
 *   - formatForShape: AnswerShape → 'markdown' | 'json' for the shape_declared event
 *   - collectToolNames: dedup tool names across citation sources
 *   - collectPermissionKeys: placeholder until citations carry permission keys
 */

import { describe, it, expect } from 'vitest'
import {
  renderAnswerToMarkdown,
  formatForShape,
  collectToolNames,
  collectPermissionKeys,
} from './render-answer'
import type { AnswerShape, Citation, SynthesizerOutput, ToolCall } from './phase-executor-contracts'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toolCall(toolName: string): ToolCall {
  return {
    toolName,
    args: {},
    result: {},
    iteration: 1,
    durationMs: 1,
  }
}

function citation(claim: string, sources: ToolCall[]): Citation {
  return {
    claim,
    sources,
    subAgentKey: 'k',
  }
}

function answer(
  shape: AnswerShape,
  content: unknown,
  citations: Citation[] = [],
): SynthesizerOutput {
  return {
    shape,
    content,
    citations,
    confidence: 'high',
    turnEndedReason: 'completed',
  }
}

// ─── renderAnswerToMarkdown ───────────────────────────────────────────────────

describe('renderAnswerToMarkdown', () => {
  it('returns short-answer content as-is', () => {
    const out = renderAnswerToMarkdown(answer('short-answer', 'Yes.'))
    expect(out).toBe('Yes.')
  })

  it('returns narrative content as-is', () => {
    const md = 'A multi-paragraph\n\nresponse.'
    const out = renderAnswerToMarkdown(answer('narrative', md))
    expect(out).toBe(md)
  })

  it('renders list as bullet markdown', () => {
    const out = renderAnswerToMarkdown(answer('list', ['a', 'b', 'c']))
    expect(out).toBe('- a\n- b\n- c')
  })

  it('renders list with empty items array as empty string', () => {
    const out = renderAnswerToMarkdown(answer('list', []))
    expect(out).toBe('')
  })

  it('renders table as pipe-table with header / separator / body', () => {
    const out = renderAnswerToMarkdown(
      answer('table', {
        columns: ['Name', 'Hours'],
        rows: [
          ['Alice', '8'],
          ['Bob', '7'],
        ],
      }),
    )
    expect(out).toBe('| Name | Hours |\n| --- | --- |\n| Alice | 8 |\n| Bob | 7 |')
  })

  it('escapes pipe characters inside table cells', () => {
    const out = renderAnswerToMarkdown(
      answer('table', {
        columns: ['k|ey', 'v'],
        rows: [['a|b', 'c']],
      }),
    )
    expect(out).toBe('| k\\|ey | v |\n| --- | --- |\n| a\\|b | c |')
  })

  it('escapes newlines inside table cells as <br>', () => {
    const out = renderAnswerToMarkdown(
      answer('table', {
        columns: ['Notes'],
        rows: [['line1\nline2']],
      }),
    )
    expect(out).toBe('| Notes |\n| --- |\n| line1<br>line2 |')
  })

  it('renders chart as JSON-fenced markdown of the entire answer', () => {
    const a = answer('chart', { type: 'bar', data: [{ x: 1, y: 2 }] })
    const out = renderAnswerToMarkdown(a)
    expect(out).toBe(`\`\`\`json\n${JSON.stringify(a)}\n\`\`\``)
  })
})

// ─── formatForShape ───────────────────────────────────────────────────────────

describe('formatForShape', () => {
  it.each<[AnswerShape, 'markdown' | 'json']>([
    ['short-answer', 'markdown'],
    ['narrative', 'markdown'],
    ['list', 'markdown'],
    ['table', 'json'],
    ['chart', 'json'],
  ])('maps %s → %s', (shape, expected) => {
    expect(formatForShape(shape)).toBe(expected)
  })
})

// ─── collectToolNames ─────────────────────────────────────────────────────────

describe('collectToolNames', () => {
  it('returns empty when no citations', () => {
    expect(collectToolNames(answer('short-answer', 'x', []))).toEqual([])
  })

  it('flattens unique tool names across all citation sources', () => {
    const a = answer('narrative', 'x', [
      citation('c1', [toolCall('alpha'), toolCall('beta')]),
      citation('c2', [toolCall('alpha'), toolCall('gamma')]),
    ])
    const names = collectToolNames(a)
    expect(names).toHaveLength(3)
    expect(new Set(names)).toEqual(new Set(['alpha', 'beta', 'gamma']))
  })

  it('returns empty when citations have no sources', () => {
    const a = answer('narrative', 'x', [citation('c1', [])])
    expect(collectToolNames(a)).toEqual([])
  })
})

// ─── collectPermissionKeys ────────────────────────────────────────────────────

describe('collectPermissionKeys', () => {
  it('returns empty array (placeholder until citations carry permission keys)', () => {
    const a = answer('narrative', 'x', [citation('c1', [toolCall('alpha')])])
    expect(collectPermissionKeys(a)).toEqual([])
  })
})
