/**
 * Unit tests for RetrievalQualityScorer (Plan 02.5 §4, R-02.5.8).
 *
 * ToolRetriever is mocked — no OpenAI or DB calls.
 *
 * Properties under test:
 *   1. Perfect recall: selected contains all expected tools → recall = 1.0.
 *   2. Partial recall: selected contains a subset of expected tools.
 *   3. Zero recall: none of the expected tools appear in selected.
 *   4. Empty expected: any selected result → trace recall = 1.0 (vacuously true).
 *   5. Multiple traces: aggregate recall is the arithmetic mean of per-trace recalls.
 *   6. Empty golden-trace set → recall = 1.0, perTraceRecall = {}.
 *   7. Fallback-fired trace: scorer records recall normally regardless of fallbackFired.
 *   8. perTraceRecall keys match the supplied traceIds.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentToolDescriptor } from '../../../../common/trpc/agent-tool-meta'
import type { SubAgentKey } from '../../domain/services/sub-agent-types'
import type { RetrieveResult } from '../../infrastructure/retrieval/tool-retriever'
import {
  RetrievalQualityScorer,
  RETRIEVAL_QUALITY_SCORER,
  type GoldenTrace,
} from './retrieval-quality-scorer'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDescriptor(name: string): AgentToolDescriptor {
  return {
    name,
    procedure: 'query',
    permission: name,
    inputSchema: undefined,
    outputSchema: undefined,
    meta: {
      whenToUse: `Use ${name}`,
      whenNotToUse: `Do not use ${name}`,
      examples: [{ input: 'x', callArgs: {} }],
    },
  }
}

function makeSubAgentKey(key: string): SubAgentKey {
  return key as SubAgentKey
}

function makeGoldenTrace(
  traceId: string,
  selectedNames: string[],
  expectedNames: string[],
  allNames?: string[],
): GoldenTrace {
  const scopeNames = allNames ?? [...new Set([...selectedNames, ...expectedNames, 'extra.tool'])]
  return {
    traceId,
    directive: { goal: `directive for ${traceId}`, constraints: [] },
    toolScope: scopeNames.map(makeDescriptor),
    coreTools: [],
    topK: selectedNames.length || 6,
    expectedToolNames: expectedNames,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RetrievalQualityScorer', () => {
  const KEY = makeSubAgentKey('test.agent')

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Test 1: Perfect recall ────────────────────────────────────────────────

  it('perfect recall: all expected tools appear in selected → recall = 1.0', async () => {
    const trace = makeGoldenTrace('trace-1', ['tool.a', 'tool.b'], ['tool.a', 'tool.b'])

    const retriever = {
      retrieve: vi.fn().mockResolvedValueOnce({
        selected: [makeDescriptor('tool.a'), makeDescriptor('tool.b')],
        fallbackFired: false,
        retrievalInputHash: 'hash-1',
      } satisfies RetrieveResult),
    }

    const scorer = new RetrievalQualityScorer(retriever)
    const result = await scorer.score(KEY, [trace])

    expect(result.recall).toBe(1.0)
    expect(result.perTraceRecall['trace-1']).toBe(1.0)
  })

  // ── Test 2: Partial recall ─────────────────────────────────────────────────

  it('partial recall: only some expected tools appear in selected', async () => {
    // expected = [A, B, C], selected = [A, B] → recall = 2/3
    const trace = makeGoldenTrace('trace-2', ['tool.a', 'tool.b'], ['tool.a', 'tool.b', 'tool.c'])

    const retriever = {
      retrieve: vi.fn().mockResolvedValueOnce({
        selected: [makeDescriptor('tool.a'), makeDescriptor('tool.b')],
        fallbackFired: false,
        retrievalInputHash: 'hash-2',
      } satisfies RetrieveResult),
    }

    const scorer = new RetrievalQualityScorer(retriever)
    const result = await scorer.score(KEY, [trace])

    expect(result.perTraceRecall['trace-2']).toBeCloseTo(2 / 3, 10)
    expect(result.recall).toBeCloseTo(2 / 3, 10)
  })

  // ── Test 3: Zero recall ───────────────────────────────────────────────────

  it('zero recall: none of the expected tools appear in selected → recall = 0', async () => {
    const trace = makeGoldenTrace('trace-3', ['tool.x'], ['tool.a', 'tool.b'])

    const retriever = {
      retrieve: vi.fn().mockResolvedValueOnce({
        selected: [makeDescriptor('tool.x')],
        fallbackFired: false,
        retrievalInputHash: 'hash-3',
      } satisfies RetrieveResult),
    }

    const scorer = new RetrievalQualityScorer(retriever)
    const result = await scorer.score(KEY, [trace])

    expect(result.perTraceRecall['trace-3']).toBe(0)
    expect(result.recall).toBe(0)
  })

  // ── Test 4: Empty expected → vacuously true ────────────────────────────────

  it('empty expectedToolNames → trace recall = 1.0 (vacuously true)', async () => {
    const trace: GoldenTrace = {
      traceId: 'trace-4',
      directive: { goal: 'anything', constraints: [] },
      toolScope: [makeDescriptor('tool.x')],
      coreTools: [],
      topK: 6,
      expectedToolNames: [],
    }

    const retriever = {
      retrieve: vi.fn().mockResolvedValueOnce({
        selected: [makeDescriptor('tool.x')],
        fallbackFired: false,
        retrievalInputHash: 'hash-4',
      } satisfies RetrieveResult),
    }

    const scorer = new RetrievalQualityScorer(retriever)
    const result = await scorer.score(KEY, [trace])

    expect(result.perTraceRecall['trace-4']).toBe(1.0)
    expect(result.recall).toBe(1.0)
  })

  // ── Test 5: Multiple traces — aggregate is arithmetic mean ─────────────────

  it('aggregate recall is arithmetic mean of per-trace recalls', async () => {
    // trace-A: recall = 1.0, trace-B: recall = 0.0 → aggregate = 0.5
    const traceA = makeGoldenTrace('trace-a', ['tool.a'], ['tool.a'])
    const traceB = makeGoldenTrace('trace-b', ['tool.x'], ['tool.a'])

    const retriever = {
      retrieve: vi
        .fn()
        .mockResolvedValueOnce({
          selected: [makeDescriptor('tool.a')],
          fallbackFired: false,
          retrievalInputHash: 'hash-a',
        } satisfies RetrieveResult)
        .mockResolvedValueOnce({
          selected: [makeDescriptor('tool.x')],
          fallbackFired: false,
          retrievalInputHash: 'hash-b',
        } satisfies RetrieveResult),
    }

    const scorer = new RetrievalQualityScorer(retriever)
    const result = await scorer.score(KEY, [traceA, traceB])

    expect(result.perTraceRecall['trace-a']).toBe(1.0)
    expect(result.perTraceRecall['trace-b']).toBe(0.0)
    expect(result.recall).toBeCloseTo(0.5, 10)
  })

  // ── Test 6: Empty golden-trace set ────────────────────────────────────────

  it('empty goldenTraces → recall = 1.0, perTraceRecall = {}', async () => {
    const retriever = { retrieve: vi.fn() }

    const scorer = new RetrievalQualityScorer(retriever)
    const result = await scorer.score(KEY, [])

    expect(result.recall).toBe(1.0)
    expect(result.perTraceRecall).toEqual({})
    expect(retriever.retrieve).not.toHaveBeenCalled()
  })

  // ── Test 7: Fallback-fired trace — recall recorded normally ───────────────

  it('fallback-fired trace: scorer records recall normally regardless of fallbackFired', async () => {
    const trace = makeGoldenTrace('trace-fb', ['tool.a', 'tool.b'], ['tool.a'])

    const retriever = {
      retrieve: vi.fn().mockResolvedValueOnce({
        selected: [makeDescriptor('tool.a'), makeDescriptor('tool.b')],
        fallbackFired: true,
        retrievalInputHash: 'hash-fb',
      } satisfies RetrieveResult),
    }

    const scorer = new RetrievalQualityScorer(retriever)
    const result = await scorer.score(KEY, [trace])

    // 'tool.a' is expected and in selected → recall = 1.0
    expect(result.perTraceRecall['trace-fb']).toBe(1.0)
    expect(result.recall).toBe(1.0)
  })

  // ── Test 8: perTraceRecall keys match supplied traceIds ───────────────────

  it('perTraceRecall keys match the supplied traceIds exactly', async () => {
    const traces = [
      makeGoldenTrace('id-alpha', ['tool.a'], ['tool.a']),
      makeGoldenTrace('id-beta', ['tool.b'], ['tool.b']),
      makeGoldenTrace('id-gamma', ['tool.c'], ['tool.c']),
    ]

    const retriever = {
      retrieve: vi
        .fn()
        .mockResolvedValueOnce({
          selected: [makeDescriptor('tool.a')],
          fallbackFired: false,
          retrievalInputHash: 'h1',
        })
        .mockResolvedValueOnce({
          selected: [makeDescriptor('tool.b')],
          fallbackFired: false,
          retrievalInputHash: 'h2',
        })
        .mockResolvedValueOnce({
          selected: [makeDescriptor('tool.c')],
          fallbackFired: false,
          retrievalInputHash: 'h3',
        }),
    }

    const scorer = new RetrievalQualityScorer(retriever)
    const result = await scorer.score(KEY, traces)

    expect(Object.keys(result.perTraceRecall).sort()).toEqual(['id-alpha', 'id-beta', 'id-gamma'])
  })

  // ── Test 9: retrieve is called once per trace, in order ───────────────────

  it('calls retrieve exactly once per golden trace, sequentially', async () => {
    const traces = [
      makeGoldenTrace('t1', ['tool.a'], ['tool.a']),
      makeGoldenTrace('t2', ['tool.b'], ['tool.b']),
    ]

    const callOrder: number[] = []
    const retriever = {
      retrieve: vi.fn().mockImplementation(async () => {
        callOrder.push(callOrder.length)
        return {
          selected: [makeDescriptor('tool.a')],
          fallbackFired: false,
          retrievalInputHash: 'h',
        } satisfies RetrieveResult
      }),
    }

    const scorer = new RetrievalQualityScorer(retriever)
    await scorer.score(KEY, traces)

    expect(retriever.retrieve).toHaveBeenCalledTimes(2)
    expect(callOrder).toEqual([0, 1])
  })

  // ── Test 10: RETRIEVAL_QUALITY_SCORER token is a Symbol ──────────────────

  it('RETRIEVAL_QUALITY_SCORER is a Symbol with correct description', () => {
    expect(typeof RETRIEVAL_QUALITY_SCORER).toBe('symbol')
    expect(RETRIEVAL_QUALITY_SCORER.description).toBe('RETRIEVAL_QUALITY_SCORER')
  })
})
