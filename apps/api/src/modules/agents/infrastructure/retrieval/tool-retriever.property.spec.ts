/**
 * Property-style tests for ToolRetriever (Plan 02.5 Task 2).
 *
 * Uses hand-crafted loops with varied inputs — no external property testing library.
 *
 * Properties tested:
 *   1. Union de-duplication: selected.length ≤ |resolved coreTools| + topK
 *      and every resolved coreTool is present in selected.
 *   2. Determinism: same directive + same vector index → same top-K ranking.
 *   3. Order invariant: selected[0..|coreTools|-1] are exactly the resolved
 *      coreTools in declaration order.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentToolDescriptor } from '../../../../common/trpc/agent-tool-meta'
import type { SubAgentKey } from '../../domain/services/sub-agent-types'

// ─── Mock AI SDK and OTel ─────────────────────────────────────────────────────

const { mockEmbed, mockCreateOpenAI } = vi.hoisted(() => {
  const mockEmbed = vi.fn()
  const mockCreateOpenAI = vi.fn(() => ({
    embedding: vi.fn(() => 'mock-embedding-model'),
  }))
  return { mockEmbed, mockCreateOpenAI }
})

vi.mock('ai', () => ({
  embed: mockEmbed,
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: mockCreateOpenAI,
}))

vi.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: vi.fn(() => ({
      startSpan: vi.fn(() => ({
        setAttributes: vi.fn(),
        end: vi.fn(),
      })),
    })),
  },
}))

// ─── Import after mocks ────────────────────────────────────────────────────────

import { ToolRetriever } from './tool-retriever'

// ─── Helpers ──────────────────────────────────────────────────────────────────

vi.stubEnv('OPENAI_API_KEY', 'test-key-property')

function makeDescriptor(name: string): AgentToolDescriptor {
  return {
    name,
    procedure: 'query',
    permission: name,
    inputSchema: undefined,
    outputSchema: undefined,
    meta: {
      whenToUse: `Use ${name}`,
      whenNotToUse: `Skip ${name}`,
      examples: [{ input: 'x', callArgs: {} }],
    },
  }
}

function makeSubAgentKey(key: string): SubAgentKey {
  return key as SubAgentKey
}

function makeEmbedderMock(index: Map<string, number[]>) {
  return {
    getEmbedding: vi.fn((toolName: string) => index.get(toolName)),
  }
}

/** Generate a random unit-ish vector of given dimension */
function randomVec(dim: number, seed: number): number[] {
  // Deterministic pseudo-random using seed
  const v: number[] = []
  for (let i = 0; i < dim; i++) {
    // Simple LCG
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff
    v.push(((seed & 0xff) - 127) / 127)
  }
  return v
}

// ─── Property tests ──────────────────────────────────────────────────────────

describe('ToolRetriever — property tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEmbed.mockReset()
    mockCreateOpenAI.mockReturnValue({
      embedding: vi.fn(() => 'mock-embedding-model'),
    })
  })

  // ── Property 1: Union de-duplication ─────────────────────────────────────

  it.each([
    { numTools: 5, numCoreTools: 0, topK: 3 },
    { numTools: 5, numCoreTools: 2, topK: 3 },
    { numTools: 8, numCoreTools: 3, topK: 5 },
    { numTools: 10, numCoreTools: 4, topK: 4 },
    { numTools: 3, numCoreTools: 3, topK: 3 },
    { numTools: 6, numCoreTools: 2, topK: 6 }, // topK > available unique tools with vectors
  ])(
    'de-duplication: numTools=$numTools coreTools=$numCoreTools topK=$topK',
    async ({ numTools, numCoreTools, topK }) => {
      const dim = 4
      const tools = Array.from({ length: numTools }, (_, i) => makeDescriptor(`tool.${i}`))

      // All tools have vectors
      const index = new Map<string, number[]>(
        tools.map((t, i) => [t.name, randomVec(dim, i * 7 + 13)]),
      )

      const directiveVec = randomVec(dim, 99)

      // Resolve coreTools — pick first numCoreTools tools from toolScope
      const coreToolNames = tools.slice(0, numCoreTools).map((t) => t.name)

      mockEmbed.mockResolvedValueOnce({ embedding: directiveVec })

      const embedder = makeEmbedderMock(index)
      const retriever = new ToolRetriever(embedder as never)
      retriever.onModuleInit()

      const result = await retriever.retrieve({
        subAgentKey: makeSubAgentKey('test.agent'),
        directive: { goal: 'property test', constraints: [] },
        toolScope: tools,
        coreTools: coreToolNames,
        topK,
      })

      // No duplicates
      const names = result.selected.map((t) => t.name)
      expect(new Set(names).size).toBe(names.length)

      // Every coreTool (that exists in scope) is present
      for (const coreName of coreToolNames) {
        expect(names).toContain(coreName)
      }

      // Length bounded: at most |resolved coreTools| + topK
      const resolvedCoreCount = coreToolNames.length // all exist in toolScope here
      expect(result.selected.length).toBeLessThanOrEqual(resolvedCoreCount + topK)

      // Length is at least resolvedCoreCount (unless toolScope is smaller)
      expect(result.selected.length).toBeGreaterThanOrEqual(resolvedCoreCount)
    },
  )

  // ── Property 2: Determinism ───────────────────────────────────────────────

  it.each([
    { numTools: 4, topK: 2, seed: 1 },
    { numTools: 6, topK: 3, seed: 42 },
    { numTools: 8, topK: 5, seed: 99 },
  ])(
    'determinism: same inputs always produce same ranking (seed=$seed, topK=$topK)',
    async ({ numTools, topK, seed }) => {
      const dim = 3
      const tools = Array.from({ length: numTools }, (_, i) => makeDescriptor(`tool.${i}`))
      const index = new Map<string, number[]>(
        tools.map((t, i) => [t.name, randomVec(dim, i * seed + 7)]),
      )
      const directiveVec = randomVec(dim, seed * 13)

      // Run retrieval 3 times with the same inputs
      for (let run = 0; run < 3; run++) {
        mockEmbed.mockResolvedValueOnce({ embedding: directiveVec })
      }

      const embedder = makeEmbedderMock(index)
      const retriever = new ToolRetriever(embedder as never)
      retriever.onModuleInit()

      const opts = {
        subAgentKey: makeSubAgentKey('test.agent'),
        directive: { goal: 'determinism test', constraints: ['c1'] },
        toolScope: tools,
        coreTools: [] as string[],
        topK,
      }

      const result1 = await retriever.retrieve(opts)
      const result2 = await retriever.retrieve(opts)
      const result3 = await retriever.retrieve(opts)

      const names1 = result1.selected.map((t) => t.name)
      const names2 = result2.selected.map((t) => t.name)
      const names3 = result3.selected.map((t) => t.name)

      expect(names1).toEqual(names2)
      expect(names2).toEqual(names3)

      // Input hash must be the same across runs for same directive
      expect(result1.retrievalInputHash).toBe(result2.retrievalInputHash)
      expect(result2.retrievalInputHash).toBe(result3.retrievalInputHash)
    },
  )

  // ── Property 3: Order invariant ───────────────────────────────────────────

  it.each([
    { numTools: 6, numCoreTools: 2, topK: 3 },
    { numTools: 8, numCoreTools: 4, topK: 4 },
    { numTools: 5, numCoreTools: 1, topK: 2 },
  ])(
    'order invariant: coreTools appear first in declaration order (numTools=$numTools coreTools=$numCoreTools)',
    async ({ numTools, numCoreTools, topK }) => {
      const dim = 4
      const tools = Array.from({ length: numTools }, (_, i) => makeDescriptor(`tool.${i}`))
      const index = new Map<string, number[]>(
        tools.map((t, i) => [t.name, randomVec(dim, i * 11 + 3)]),
      )
      const directiveVec = randomVec(dim, 77)

      // Pick coreTools from various positions — not necessarily first
      const coreToolNames = tools
        .filter((_, i) => i % Math.ceil(numTools / numCoreTools) === 0)
        .slice(0, numCoreTools)
        .map((t) => t.name)

      mockEmbed.mockResolvedValueOnce({ embedding: directiveVec })

      const embedder = makeEmbedderMock(index)
      const retriever = new ToolRetriever(embedder as never)
      retriever.onModuleInit()

      const result = await retriever.retrieve({
        subAgentKey: makeSubAgentKey('test.agent'),
        directive: { goal: 'order test', constraints: [] },
        toolScope: tools,
        coreTools: coreToolNames,
        topK,
      })

      // First N selected entries must be exactly the resolved coreTools
      // in declaration order
      const resolvedCoreTools = coreToolNames.filter((name) => tools.some((t) => t.name === name))

      for (let i = 0; i < resolvedCoreTools.length; i++) {
        expect(result.selected[i]!.name).toBe(resolvedCoreTools[i])
      }
    },
  )
})
