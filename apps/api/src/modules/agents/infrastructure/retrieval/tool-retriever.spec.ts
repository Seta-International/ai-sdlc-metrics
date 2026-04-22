/**
 * Unit tests for ToolRetriever (Plan 02.5 Task 2).
 *
 * All external dependencies are mocked:
 *   - `ai.embed` — mocked via vi.mock
 *   - `@ai-sdk/openai.createOpenAI` — mocked via vi.mock
 *   - `ToolDescriptorEmbedder` — mock instance injected
 *   - `@opentelemetry/api` — mocked via vi.mock to capture span attrs
 *
 * No real OpenAI or DB calls are made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentToolDescriptor } from '../../../../common/trpc/agent-tool-meta'
import type { SubAgentKey } from '../../domain/services/sub-agent-types'

// ─── Mock AI SDK and OTel before importing the retriever ──────────────────────

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

// ─── Capture OTel span attrs via mock ─────────────────────────────────────────

const capturedAttrs: Record<string, unknown> = {}
const mockSpan = {
  setAttributes: vi.fn((attrs: Record<string, unknown>) => {
    Object.assign(capturedAttrs, attrs)
  }),
  end: vi.fn(),
}
const mockTracer = {
  startSpan: vi.fn(() => mockSpan),
}

vi.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: vi.fn(() => mockTracer),
  },
}))

// ─── Import after mocks ────────────────────────────────────────────────────────

import { ToolRetriever, TOOL_RETRIEVER } from './tool-retriever'

// ─── Helpers ──────────────────────────────────────────────────────────────────

vi.stubEnv('OPENAI_API_KEY', 'test-key-unit')

function makeDescriptor(name: string): AgentToolDescriptor {
  return {
    name,
    procedure: 'query',
    permission: `${name.replace(/\./g, ':')}`,
    inputSchema: undefined,
    outputSchema: undefined,
    meta: {
      whenToUse: `Use ${name}`,
      whenNotToUse: `Do not use ${name} for unrelated tasks`,
      examples: [{ input: 'example', callArgs: {} }],
    },
  }
}

function makeSubAgentKey(key: string): SubAgentKey {
  return key as SubAgentKey
}

/**
 * Build a mock ToolDescriptorEmbedder with a fixed in-memory index.
 */
function makeEmbedderMock(index: Map<string, number[]>) {
  return {
    getEmbedding: vi.fn((toolName: string) => index.get(toolName)),
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ToolRetriever', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEmbed.mockReset()
    mockCreateOpenAI.mockReturnValue({
      embedding: vi.fn(() => 'mock-embedding-model'),
    })
    // Reset captured attrs
    for (const key of Object.keys(capturedAttrs)) {
      delete capturedAttrs[key]
    }
  })

  // ── Test 1: Happy path — top-K retrieval ──────────────────────────────────

  it('retrieve — happy path: returns top-K tools by cosine similarity', async () => {
    const tools = [
      makeDescriptor('tool.a'),
      makeDescriptor('tool.b'),
      makeDescriptor('tool.c'),
      makeDescriptor('tool.d'),
      makeDescriptor('tool.e'),
    ]

    // Directive embedding
    const directiveVec = [1, 0, 0]

    // Tool vectors — tool.b and tool.d are most similar to [1,0,0]
    const index = new Map<string, number[]>([
      ['tool.a', [0, 1, 0]], // cos = 0
      ['tool.b', [0.9, 0.1, 0]], // cos ≈ 0.994 (highest)
      ['tool.c', [0, 0, 1]], // cos = 0
      ['tool.d', [0.8, 0.2, 0]], // cos ≈ 0.970 (second)
      ['tool.e', [0, 1, 0]], // cos = 0
    ])

    mockEmbed.mockResolvedValueOnce({ embedding: directiveVec })

    const embedder = makeEmbedderMock(index)
    const retriever = new ToolRetriever(embedder as never)
    retriever.onModuleInit()

    const result = await retriever.retrieve({
      subAgentKey: makeSubAgentKey('planner.read-only'),
      directive: { goal: 'list tasks', constraints: ['only read'] },
      toolScope: tools,
      coreTools: [],
      topK: 2,
    })

    expect(result.fallbackFired).toBe(false)
    expect(result.selected).toHaveLength(2)
    expect(result.selected[0]!.name).toBe('tool.b')
    expect(result.selected[1]!.name).toBe('tool.d')
    expect(result.retrievalInputHash).toMatch(/^[a-f0-9]{64}$/)
  })

  // ── Test 2: coreTools union ───────────────────────────────────────────────

  it('retrieve — coreTools union: coreTools first in declaration order, no duplicates', async () => {
    // 8 tools, tool3 and tool5 are coreTools, topK = 3
    const tools = [
      makeDescriptor('tool.1'),
      makeDescriptor('tool.2'),
      makeDescriptor('tool.3'),
      makeDescriptor('tool.4'),
      makeDescriptor('tool.5'),
      makeDescriptor('tool.6'),
      makeDescriptor('tool.7'),
      makeDescriptor('tool.8'),
    ]

    const directiveVec = [1, 0, 0, 0]

    // tool.3 is in top-3 AND in coreTools — should appear only once (as coreTool)
    // Ranking by cosine: tool.3 > tool.6 > tool.2 (descending)
    const index = new Map<string, number[]>([
      ['tool.1', [0, 1, 0, 0]], // cos = 0
      ['tool.2', [0.7, 0.3, 0, 0]], // cos ≈ 0.919
      ['tool.3', [0.95, 0.05, 0, 0]], // highest cos ≈ 0.998 — in coreTools
      ['tool.4', [0, 0, 1, 0]], // cos = 0
      ['tool.5', [0.1, 0.9, 0, 0]], // low cos — in coreTools
      ['tool.6', [0.85, 0.15, 0, 0]], // cos ≈ 0.985 (second ranked)
      ['tool.7', [0, 0, 0, 1]], // cos = 0
      ['tool.8', [0, 0.5, 0.5, 0]], // cos = 0
    ])

    mockEmbed.mockResolvedValueOnce({ embedding: directiveVec })

    const embedder = makeEmbedderMock(index)
    const retriever = new ToolRetriever(embedder as never)
    retriever.onModuleInit()

    const result = await retriever.retrieve({
      subAgentKey: makeSubAgentKey('planner.read-only'),
      directive: { goal: 'perform task', constraints: [] },
      toolScope: tools,
      coreTools: ['tool.3', 'tool.5'], // declaration order: tool.3 first
      topK: 3,
    })

    // No duplicates
    const names = result.selected.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)

    // coreTools come first in declaration order
    expect(result.selected[0]!.name).toBe('tool.3')
    expect(result.selected[1]!.name).toBe('tool.5')

    // After coreTools: top-K tools NOT in coreTools
    // top-3 by similarity: tool.3 (≈0.998), tool.6 (≈0.985), tool.2 (≈0.919)
    // tool.3 is in coreTools → exclude from ranked results → add tool.6 and tool.2
    expect(result.selected[2]!.name).toBe('tool.6')
    expect(result.selected[3]!.name).toBe('tool.2')

    // Total = 2 coreTools + 2 new from top-3 (tool.3 was coreTool, deduped)
    expect(result.selected).toHaveLength(4)

    expect(result.fallbackFired).toBe(false)
  })

  // ── Test 3: Fallback path — embed throws ─────────────────────────────────

  it('retrieve — fallback path: embed throws → returns full toolScope, fallbackFired=true', async () => {
    const tools = [
      makeDescriptor('tool.a'),
      makeDescriptor('tool.b'),
      makeDescriptor('tool.c'),
      makeDescriptor('tool.d'),
      makeDescriptor('tool.e'),
    ]

    mockEmbed.mockRejectedValueOnce(new Error('provider timeout'))

    const embedder = makeEmbedderMock(new Map())
    const retriever = new ToolRetriever(embedder as never)
    retriever.onModuleInit()

    const result = await retriever.retrieve({
      subAgentKey: makeSubAgentKey('planner.read-only'),
      directive: { goal: 'do something', constraints: ['constraint1'] },
      toolScope: tools,
      coreTools: [],
      topK: 2,
    })

    expect(result.fallbackFired).toBe(true)
    // selected is the full toolScope (all 5)
    expect(result.selected).toHaveLength(5)
    expect(result.selected).toEqual(tools)
    // retrievalInputHash is still computed (before embed is called)
    expect(result.retrievalInputHash).toMatch(/^[a-f0-9]{64}$/)
    // span must always be ended even on the fallback path
    expect(mockSpan.end).toHaveBeenCalled()
  })

  // ── Test 4: Tools without vectors are skipped ─────────────────────────────

  it('retrieve — tool without vector is skipped from ranking', async () => {
    const tools = [
      makeDescriptor('tool.a'),
      makeDescriptor('tool.b'),
      makeDescriptor('tool.c'),
      makeDescriptor('tool.d'), // no vector in index
    ]

    const directiveVec = [1, 0, 0]

    // Only 3 tools have vectors; tool.d has none
    const index = new Map<string, number[]>([
      ['tool.a', [1, 0, 0]], // cos = 1
      ['tool.b', [0, 1, 0]], // cos = 0
      ['tool.c', [0, 0, 1]], // cos = 0
      // tool.d intentionally absent
    ])

    mockEmbed.mockResolvedValueOnce({ embedding: directiveVec })

    const embedder = makeEmbedderMock(index)
    const retriever = new ToolRetriever(embedder as never)
    retriever.onModuleInit()

    const result = await retriever.retrieve({
      subAgentKey: makeSubAgentKey('planner.read-only'),
      directive: { goal: 'some goal', constraints: [] },
      toolScope: tools,
      coreTools: [],
      topK: 4, // request all 4, but only 3 have vectors
    })

    expect(result.fallbackFired).toBe(false)
    // tool.d is excluded (no vector)
    expect(result.selected).toHaveLength(3)
    const names = result.selected.map((t) => t.name)
    expect(names).not.toContain('tool.d')
  })

  // ── Test 5: OTel span attrs are set correctly ─────────────────────────────

  it('retrieve — OTel span attributes are set', async () => {
    const tools = [makeDescriptor('tool.a'), makeDescriptor('tool.b')]
    const directiveVec = [1, 0]

    const index = new Map<string, number[]>([
      ['tool.a', [1, 0]],
      ['tool.b', [0, 1]],
    ])

    mockEmbed.mockResolvedValueOnce({ embedding: directiveVec })

    const embedder = makeEmbedderMock(index)
    const retriever = new ToolRetriever(embedder as never)
    retriever.onModuleInit()

    await retriever.retrieve({
      subAgentKey: makeSubAgentKey('planner.read-only'),
      directive: { goal: 'test goal', constraints: [] },
      toolScope: tools,
      coreTools: [],
      topK: 1,
    })

    expect(mockTracer.startSpan).toHaveBeenCalledWith('tool-retrieval:retrieve')
    expect(mockSpan.setAttributes).toHaveBeenCalled()
    expect(capturedAttrs['tool.retrieval.sub_agent_key']).toBe('planner.read-only')
    expect(capturedAttrs['tool.retrieval.topk_configured']).toBe(1)
    expect(capturedAttrs['tool.retrieval.tool_scope_size']).toBe(2)
    expect(capturedAttrs['tool.retrieval.core_tools_size']).toBe(0)
    expect(capturedAttrs['tool.retrieval.fallback_fired']).toBe(false)
    expect(capturedAttrs['tool.retrieval.input_hash']).toMatch(/^[a-f0-9]{64}$/)
    expect(typeof capturedAttrs['tool.retrieval.topk_resolved']).toBe('number')
    expect(typeof capturedAttrs['tool.retrieval.duration_ms']).toBe('number')
    expect(mockSpan.end).toHaveBeenCalled()
  })

  // ── Test 6: TOOL_RETRIEVER token is a Symbol ──────────────────────────────

  it('TOOL_RETRIEVER is a Symbol with the correct description', () => {
    expect(typeof TOOL_RETRIEVER).toBe('symbol')
    expect(TOOL_RETRIEVER.description).toBe('TOOL_RETRIEVER')
  })

  // ── Test 7: retrievalInputHash is deterministic ────────────────────────────

  it('retrieve — same directive produces the same retrievalInputHash', async () => {
    const tools = [makeDescriptor('tool.a')]
    const directiveVec = [1, 0]
    const index = new Map<string, number[]>([['tool.a', [1, 0]]])

    mockEmbed
      .mockResolvedValueOnce({ embedding: directiveVec })
      .mockResolvedValueOnce({ embedding: directiveVec })

    const embedder = makeEmbedderMock(index)
    const retriever = new ToolRetriever(embedder as never)
    retriever.onModuleInit()

    const opts = {
      subAgentKey: makeSubAgentKey('planner.read-only'),
      directive: { goal: 'same goal', constraints: ['same constraint'] },
      toolScope: tools,
      coreTools: [],
      topK: 1,
    }

    const result1 = await retriever.retrieve(opts)
    const result2 = await retriever.retrieve(opts)

    expect(result1.retrievalInputHash).toBe(result2.retrievalInputHash)
  })

  // ── Test 7b: embed succeeds but no tools have vectors ────────────────────

  it('retrieve — embed succeeds but all tools have no vector: returns only resolved coreTools, fallbackFired=false', async () => {
    const tools = [makeDescriptor('tool.a'), makeDescriptor('tool.b'), makeDescriptor('tool.c')]

    // Embedder returns undefined for every tool (empty index)
    const embedder = makeEmbedderMock(new Map())

    const directiveVec = [1, 0, 0]
    mockEmbed.mockResolvedValueOnce({ embedding: directiveVec })

    const retriever = new ToolRetriever(embedder as never)
    retriever.onModuleInit()

    const result = await retriever.retrieve({
      subAgentKey: makeSubAgentKey('planner.read-only'),
      directive: { goal: 'do something', constraints: [] },
      toolScope: tools,
      coreTools: [],
      topK: 3,
    })

    // No vectors → scored array is empty → no tools from ranking
    // No coreTools → selected is empty
    expect(result.selected).toHaveLength(0)
    expect(result.fallbackFired).toBe(false)
    expect(result.retrievalInputHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('retrieve — embed succeeds, no vectors in embedder, but coreTools exist: returns only coreTools', async () => {
    const tools = [makeDescriptor('tool.a'), makeDescriptor('tool.b'), makeDescriptor('tool.c')]

    // Embedder returns undefined for every tool (empty index)
    const embedder = makeEmbedderMock(new Map())

    const directiveVec = [1, 0, 0]
    mockEmbed.mockResolvedValueOnce({ embedding: directiveVec })

    const retriever = new ToolRetriever(embedder as never)
    retriever.onModuleInit()

    const result = await retriever.retrieve({
      subAgentKey: makeSubAgentKey('planner.read-only'),
      directive: { goal: 'do something', constraints: [] },
      toolScope: tools,
      coreTools: ['tool.a', 'tool.c'],
      topK: 3,
    })

    // No vectors → scored array is empty → no tools from ranking
    // coreTools are resolved from scope
    expect(result.selected).toHaveLength(2)
    expect(result.selected[0]!.name).toBe('tool.a')
    expect(result.selected[1]!.name).toBe('tool.c')
    expect(result.fallbackFired).toBe(false)
  })

  // ── Test 8: coreTools not in toolScope are silently skipped ──────────────

  it('retrieve — coreTools names not in toolScope are silently skipped', async () => {
    const tools = [makeDescriptor('tool.a'), makeDescriptor('tool.b')]
    const directiveVec = [1, 0]
    const index = new Map<string, number[]>([
      ['tool.a', [1, 0]],
      ['tool.b', [0, 1]],
    ])

    mockEmbed.mockResolvedValueOnce({ embedding: directiveVec })

    const embedder = makeEmbedderMock(index)
    const retriever = new ToolRetriever(embedder as never)
    retriever.onModuleInit()

    const result = await retriever.retrieve({
      subAgentKey: makeSubAgentKey('planner.read-only'),
      directive: { goal: 'some goal', constraints: [] },
      toolScope: tools,
      coreTools: ['tool.a', 'tool.nonexistent'], // tool.nonexistent not in scope
      topK: 1,
    })

    const names = result.selected.map((t) => t.name)
    expect(names).toContain('tool.a')
    expect(names).not.toContain('tool.nonexistent')
  })
})
