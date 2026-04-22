/**
 * Unit tests for ToolDescriptorEmbedder (Plan 02.5 Task 1).
 *
 * All external dependencies are mocked:
 *   - DB (Drizzle client) — mock with vitest's vi.fn()
 *   - `ai.embedMany` — mocked via vi.mock
 *   - `@ai-sdk/openai.createOpenAI` — mocked via vi.mock
 *
 * No real DB or OpenAI calls are made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentToolDescriptor } from '../../../../common/trpc/agent-tool-meta'

// ─── Mock AI SDK before importing the embedder ────────────────────────────────

const { mockEmbedMany, mockCreateOpenAI } = vi.hoisted(() => {
  const mockEmbedMany = vi.fn()
  const mockCreateOpenAI = vi.fn(() => ({
    embedding: vi.fn(() => 'mock-embedding-model'),
  }))
  return { mockEmbedMany, mockCreateOpenAI }
})

vi.mock('ai', () => ({
  embedMany: mockEmbedMany,
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: mockCreateOpenAI,
}))

// ─── Import after mocks ────────────────────────────────────────────────────────

import { ToolDescriptorEmbedder, TOOL_DESCRIPTOR_EMBEDDER } from './tool-descriptor-embedder'

// ─── Helpers ──────────────────────────────────────────────────────────────────

vi.stubEnv('OPENAI_API_KEY', 'test-key-unit')

/**
 * Build a minimal AgentToolDescriptor fixture.
 */
function makeDescriptor(
  name: string,
  whenToUse = 'use it',
  whenNotToUse = 'skip it',
): AgentToolDescriptor {
  return {
    name,
    procedure: 'query',
    permission: `${name.replace(/\./g, ':')}`,
    inputSchema: undefined,
    outputSchema: undefined,
    meta: {
      whenToUse,
      whenNotToUse,
      examples: [{ input: 'example', callArgs: {} }],
    },
  }
}

/**
 * Compute the same SHA-256 content hash the embedder uses for a descriptor.
 * Mirrors ToolDescriptorEmbedder.computeContentHash (private method).
 */
async function computeHash(d: AgentToolDescriptor): Promise<string> {
  const { createHash } = await import('node:crypto')
  const { canonicalize } = await import('../cache/canonical-args')
  const content = { whenNotToUse: d.meta.whenNotToUse, whenToUse: d.meta.whenToUse }
  const { canonical } = canonicalize(content)
  return createHash('sha256').update(canonical).digest('hex')
}

/**
 * Build a minimal mock Drizzle db that satisfies the query patterns in ToolDescriptorEmbedder.
 *
 * The embedder uses:
 *   db.select().from(...).where(...) — for looking up existing rows by tool_name
 *   db.insert(...).values(...).onConflictDoNothing() — for inserting new rows
 *
 * Simplified: the where() mock returns ALL provided rows regardless of the
 * actual where predicate — sufficient because the embedder iterates descriptors
 * one-at-a-time and the Set-based existingPairs check handles correctness.
 */
function makeDbMock(
  existingRows: Array<{ toolName: string; contentHash: string; embedding: number[] }>,
) {
  const insertMock = {
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  }

  const selectResult = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockImplementation(() => {
      return Promise.resolve(existingRows)
    }),
  }

  return {
    select: vi.fn().mockReturnValue(selectResult),
    insert: vi.fn().mockReturnValue(insertMock),
    _selectResult: selectResult,
    _insertMock: insertMock,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ToolDescriptorEmbedder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset queued mock return values (clearAllMocks does not reset implementations/queues)
    mockEmbedMany.mockReset()
    // Reset createOpenAI to return a valid mock with embedding method
    mockCreateOpenAI.mockReturnValue({
      embedding: vi.fn(() => 'mock-embedding-model'),
    })
  })

  // ── Test 1: All new descriptors → calls embedMany, inserts rows ───────────

  it('all new descriptors: calls embedMany, inserts all rows, returns { embedded: N, reused: 0 }', async () => {
    const descriptors = [
      makeDescriptor('planner.tasks.list'),
      makeDescriptor('planner.tasks.create'),
    ]

    // No existing rows in DB
    const mockEmbeddings = [
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ]
    mockEmbedMany.mockResolvedValueOnce({ embeddings: mockEmbeddings })

    const db = makeDbMock([]) // empty DB
    const embedder = new ToolDescriptorEmbedder(db as never)
    embedder.onModuleInit()

    const result = await embedder.ensureEmbedded(descriptors)

    expect(result.embedded).toBe(2)
    expect(result.reused).toBe(0)
    expect(mockEmbedMany).toHaveBeenCalledOnce()
    // Bulk insert: one db.insert() call for all new descriptors
    expect(db.insert).toHaveBeenCalledTimes(1)
  })

  // ── Test 2: All existing (same content_hash) → no embedMany call ──────────

  it('all existing (same hash): does NOT call embedMany, returns { embedded: 0, reused: N }', async () => {
    const descriptors = [
      makeDescriptor('planner.tasks.list'),
      makeDescriptor('planner.tasks.create'),
    ]

    const existingRows = await Promise.all(
      descriptors.map(async (d) => ({
        toolName: d.name,
        contentHash: await computeHash(d),
        embedding: [0.1, 0.2, 0.3],
      })),
    )

    const db = makeDbMock(existingRows)
    const embedder = new ToolDescriptorEmbedder(db as never)
    embedder.onModuleInit()

    const result = await embedder.ensureEmbedded(descriptors)

    expect(result.embedded).toBe(0)
    expect(result.reused).toBe(2)
    expect(mockEmbedMany).not.toHaveBeenCalled()
  })

  // ── Test 3: Mixed — embeds only new ones ──────────────────────────────────

  it('mixed: embeds only descriptors with no matching DB row, reuses the rest', async () => {
    const descriptors = [
      makeDescriptor('planner.tasks.list'), // will be in DB (reused)
      makeDescriptor('planner.tasks.create'), // NOT in DB (new, will embed)
    ]

    // Only the first descriptor exists in DB
    const existingRows = [
      {
        toolName: descriptors[0]!.name,
        contentHash: await computeHash(descriptors[0]!),
        embedding: [0.9, 0.8, 0.7],
      },
    ]

    mockEmbedMany.mockResolvedValueOnce({ embeddings: [[0.1, 0.2, 0.3]] })

    const db = makeDbMock(existingRows)
    const embedder = new ToolDescriptorEmbedder(db as never)
    embedder.onModuleInit()

    const result = await embedder.ensureEmbedded(descriptors)

    expect(result.embedded).toBe(1) // only the new one
    expect(result.reused).toBe(1) // the existing one
    expect(mockEmbedMany).toHaveBeenCalledOnce()
    // embedMany should only receive the text for the new descriptor
    const embedManyCall = mockEmbedMany.mock.calls[0][0] as { values: string[] }
    expect(embedManyCall.values).toHaveLength(1)
    // Insert should be called only once (for the new one)
    expect(db.insert).toHaveBeenCalledTimes(1)
  })

  // ── Test 4: Boot-time refusal — embedMany throws AND some rows are missing ─

  it('boot-time refusal: embedMany throws AND some descriptors have no DB row → throws with descriptive error', async () => {
    const descriptors = [makeDescriptor('planner.tasks.list')]

    // No existing rows in DB — embedMany failure is fatal
    const db = makeDbMock([])
    mockEmbedMany.mockRejectedValueOnce(new Error('OpenAI API unreachable: connection refused'))

    const embedder = new ToolDescriptorEmbedder(db as never)
    embedder.onModuleInit()

    await expect(embedder.ensureEmbedded(descriptors)).rejects.toThrow(
      /embedding provider.*unreachable|provider.*unreachable|failed to embed/i,
    )
  })

  // ── Test 5: Boot-time success — embedMany throws BUT all rows exist in DB ──

  it('boot-time success: embedMany throws BUT all rows exist in DB → succeeds (returns reused count)', async () => {
    const descriptors = [makeDescriptor('planner.tasks.list')]

    // All rows exist in DB — provider down but irrelevant
    const existingRows = await Promise.all(
      descriptors.map(async (d) => ({
        toolName: d.name,
        contentHash: await computeHash(d),
        embedding: [0.5, 0.6, 0.7],
      })),
    )

    const db = makeDbMock(existingRows)
    // embedMany would throw but we never call it (all reused)
    mockEmbedMany.mockRejectedValueOnce(new Error('provider down'))

    const embedder = new ToolDescriptorEmbedder(db as never)
    embedder.onModuleInit()

    const result = await embedder.ensureEmbedded(descriptors)

    expect(result.embedded).toBe(0)
    expect(result.reused).toBe(1)
    // embedMany should NOT have been called at all (all rows exist)
    expect(mockEmbedMany).not.toHaveBeenCalled()
  })

  // ── Test 6: getEmbedding — known tool returns vector; unknown returns undefined ──

  it('getEmbedding: returns vector for known tool, undefined for unknown after buildInMemoryIndex', async () => {
    const descriptors = [makeDescriptor('planner.tasks.list')]

    const existingRows = [
      {
        toolName: 'planner.tasks.list',
        contentHash: await computeHash(descriptors[0]!),
        embedding: [0.1, 0.2, 0.3],
      },
    ]

    const db = makeDbMock(existingRows)
    const embedder = new ToolDescriptorEmbedder(db as never)
    embedder.onModuleInit()

    await embedder.ensureEmbedded(descriptors)
    await embedder.buildInMemoryIndex(descriptors)

    expect(embedder.getEmbedding('planner.tasks.list')).toEqual([0.1, 0.2, 0.3])
    expect(embedder.getEmbedding('planner.tasks.unknown')).toBeUndefined()
  })

  // ── Test 7: TOOL_DESCRIPTOR_EMBEDDER token is a Symbol ───────────────────

  it('TOOL_DESCRIPTOR_EMBEDDER is a Symbol with the correct description', () => {
    expect(typeof TOOL_DESCRIPTOR_EMBEDDER).toBe('symbol')
    expect(TOOL_DESCRIPTOR_EMBEDDER.description).toBe('TOOL_DESCRIPTOR_EMBEDDER')
  })

  // ── Test 8: Kernel audit signal emitted once per newly inserted row ───────

  it('emits an audit log signal once per new row appended', async () => {
    const descriptors = [
      makeDescriptor('planner.tasks.list'),
      makeDescriptor('planner.tasks.create'),
    ]

    // Both are new — embedMany must succeed so the insert path is reached.
    mockEmbedMany.mockResolvedValueOnce({
      embeddings: [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ],
    })

    const db = makeDbMock([]) // empty DB — both will be new
    const embedder = new ToolDescriptorEmbedder(db as never)
    embedder.onModuleInit()

    // Spy on the internal logger's .log method to verify audit signal emission.
    // TODO plan 07: replace with KernelAuditFacade.emit spy once plan 07 lands.
    const logSpy = vi.spyOn(embedder['logger'], 'log')

    await embedder.ensureEmbedded(descriptors)

    // One audit log per newly inserted row (2 descriptors, 2 new rows)
    const auditCalls = logSpy.mock.calls.filter(
      ([msg]) => typeof msg === 'string' && msg.includes('audit:agent.tool_descriptor_embedded'),
    )
    expect(auditCalls).toHaveLength(2)
    expect(auditCalls[0]![0]).toContain('planner.tasks.list')
    expect(auditCalls[1]![0]).toContain('planner.tasks.create')
  })
})
