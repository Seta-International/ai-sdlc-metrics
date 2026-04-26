/**
 * SemanticResultCache — unit tests (Plan 14, Task 3).
 *
 * Mocks:
 * - DB: mock select/insert/delete chains via vi.fn()
 * - 'ai' embed: mocked via vi.mock / vi.hoisted
 * - '@ai-sdk/openai' createOpenAI: mocked via vi.mock / vi.hoisted
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Logger } from '@nestjs/common'

// ─── Mock AI SDK before importing the service ─────────────────────────────────

const { mockEmbed, mockCreateOpenAI } = vi.hoisted(() => {
  const mockEmbed = vi.fn()
  const mockCreateOpenAI = vi.fn(() => ({
    embedding: vi.fn((modelName: string) => ({ modelName })),
  }))
  return { mockEmbed, mockCreateOpenAI }
})

vi.mock('ai', () => ({
  embed: mockEmbed,
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: mockCreateOpenAI,
}))

vi.stubEnv('LOCAL_DEV', 'true')

// ─── Import after mocks ────────────────────────────────────────────────────────

import { SemanticResultCache, SEMANTIC_RESULT_CACHE } from './semantic-result-cache'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a mock Drizzle db that handles:
 * - .select().from().where() — two sequential calls:
 *     first call → selectRows (exact match)
 *     second call → selectCandidateRows (semantic candidates)
 * - .insert().values().onConflictDoNothing()
 * - .delete().where()
 */
function buildMockDb(options: {
  selectRows?: unknown[]
  selectCandidateRows?: unknown[]
  selectThrows?: boolean
  insertThrows?: boolean
  deleteResult?: { rowCount?: number }
  deleteThrows?: boolean
}) {
  const {
    selectRows = [],
    selectCandidateRows,
    selectThrows = false,
    insertThrows = false,
    deleteResult = {},
    deleteThrows = false,
  } = options

  let selectCallCount = 0

  const whereImpl = vi.fn().mockImplementation(() => {
    if (selectThrows) return Promise.reject(new Error('DB error'))
    selectCallCount++
    // First select → exact match rows, second → semantic candidate rows
    if (selectCandidateRows !== undefined && selectCallCount >= 2) {
      return Promise.resolve(selectCandidateRows)
    }
    return Promise.resolve(selectRows)
  })

  const fromImpl = vi.fn().mockReturnValue({ where: whereImpl })
  const selectImpl = vi.fn().mockReturnValue({ from: fromImpl })

  const onConflictDoNothingImpl = vi.fn().mockImplementation(() => {
    if (insertThrows) return Promise.reject(new Error('DB insert error'))
    return Promise.resolve()
  })

  const valuesImpl = vi.fn().mockReturnValue({
    onConflictDoNothing: onConflictDoNothingImpl,
  })

  const insertImpl = vi.fn().mockReturnValue({ values: valuesImpl })

  const deleteWhereImpl = vi.fn().mockImplementation(async () => {
    if (deleteThrows) throw new Error('DB delete error')
    return deleteResult
  })

  const deleteFromImpl = vi.fn().mockReturnValue({ where: deleteWhereImpl })

  return {
    select: selectImpl,
    insert: insertImpl,
    delete: deleteFromImpl,
    // Expose internals for assertions
    _where: whereImpl,
    _from: fromImpl,
    _values: valuesImpl,
    _onConflictDoNothing: onConflictDoNothingImpl,
    _deleteWhere: deleteWhereImpl,
  }
}

function makeService(db: ReturnType<typeof buildMockDb>): SemanticResultCache {
  const service = new SemanticResultCache(db as never)
  // LOCAL_DEV=true already set — onModuleInit will skip key validation
  service.onModuleInit()
  // Inject a mock openai client so embed() will be invoked
  ;(service as unknown as Record<string, unknown>)['openai'] = mockCreateOpenAI('test-key')
  return service
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid-1'
const TOOL_NAME = 'projects.getTasks'
const ARGS = { projectId: 'p-1', status: 'open' }
const RESULT = { tasks: [{ id: 't-1', title: 'Task 1' }] }
const EMBEDDING_MODEL = 'text-embedding-3-small'
const DISTANCE_THRESHOLD = 0.85
const TTL_SECONDS = 300
const STORED_AT = new Date('2026-04-20T10:00:00.000Z')

// Fake embedding vectors
const EMBEDDING_A = [0.1, 0.2, 0.9]
const EMBEDDING_B = [0.1, 0.2, 0.9] // identical → cosine = 1.0
const EMBEDDING_C = [0.9, 0.1, -0.9] // very different → low cosine similarity

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SemanticResultCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Silence logger output
    vi.spyOn(Logger.prototype, 'log').mockReturnValue(undefined)
    vi.spyOn(Logger.prototype, 'warn').mockReturnValue(undefined)
    vi.spyOn(Logger.prototype, 'error').mockReturnValue(undefined)
    vi.spyOn(Logger.prototype, 'debug').mockReturnValue(undefined)
  })

  // ── DI token ──────────────────────────────────────────────────────────────

  it('exports SEMANTIC_RESULT_CACHE symbol', () => {
    expect(typeof SEMANTIC_RESULT_CACHE).toBe('symbol')
  })

  // ── get() — exact hit ─────────────────────────────────────────────────────

  it('get() — exact hit: returns hitKind "exact" when DB returns a matching row', async () => {
    const exactRow = {
      id: 'row-1',
      tenantId: TENANT_ID,
      toolName: TOOL_NAME,
      canonicalArgsHash: 'some-hash',
      result: RESULT,
      storedAt: STORED_AT,
      ttlSeconds: TTL_SECONDS,
    }

    const db = buildMockDb({ selectRows: [exactRow] })
    const service = makeService(db)

    const hit = await service.get({
      tenantId: TENANT_ID,
      toolName: TOOL_NAME,
      args: ARGS,
      embeddingModel: EMBEDDING_MODEL,
      distanceThreshold: DISTANCE_THRESHOLD,
    })

    expect(hit).toBeDefined()
    expect(hit?.hitKind).toBe('exact')
    expect(hit?.result).toEqual(RESULT)
    expect(hit?.storedAt).toEqual(STORED_AT)
    // embed() must NOT be called on exact hit (R-14.4)
    expect(mockEmbed).not.toHaveBeenCalled()
  })

  // ── get() — TTL expiry ────────────────────────────────────────────────────

  it('get() — TTL expiry: returns undefined when DB returns no rows (expired filter applied)', async () => {
    // Both exact and semantic selects return empty (simulates expired rows filtered out)
    const db = buildMockDb({ selectRows: [], selectCandidateRows: [] })
    const service = makeService(db)

    mockEmbed.mockResolvedValueOnce({ embedding: EMBEDDING_A, usage: { tokens: 3 } })

    const hit = await service.get({
      tenantId: TENANT_ID,
      toolName: TOOL_NAME,
      args: ARGS,
      embeddingModel: EMBEDDING_MODEL,
      distanceThreshold: DISTANCE_THRESHOLD,
    })

    expect(hit).toBeUndefined()
  })

  // ── get() — semantic hit within threshold ─────────────────────────────────

  it('get() — semantic hit: returns hitKind "semantic" when cosine similarity >= threshold', async () => {
    const candidateRow = {
      id: 'row-2',
      tenantId: TENANT_ID,
      toolName: TOOL_NAME,
      canonicalArgsHash: 'other-hash',
      semanticEmbedding: EMBEDDING_B,
      embeddingModel: EMBEDDING_MODEL,
      result: RESULT,
      storedAt: STORED_AT,
      ttlSeconds: TTL_SECONDS,
    }

    // exact miss (empty), then semantic candidate rows
    const db = buildMockDb({ selectRows: [], selectCandidateRows: [candidateRow] })
    const service = makeService(db)

    // embed() returns EMBEDDING_A (identical to EMBEDDING_B → cosine = 1.0 ≥ 0.85)
    mockEmbed.mockResolvedValueOnce({ embedding: EMBEDDING_A, usage: { tokens: 3 } })

    const hit = await service.get({
      tenantId: TENANT_ID,
      toolName: TOOL_NAME,
      args: ARGS,
      embeddingModel: EMBEDDING_MODEL,
      distanceThreshold: DISTANCE_THRESHOLD,
    })

    expect(hit).toBeDefined()
    expect(hit?.hitKind).toBe('semantic')
    expect(hit?.result).toEqual(RESULT)
    expect(hit?.storedAt).toEqual(STORED_AT)
  })

  // ── get() — semantic miss outside threshold ───────────────────────────────

  it('get() — semantic miss: returns undefined when all candidates are below threshold', async () => {
    const candidateRow = {
      id: 'row-3',
      tenantId: TENANT_ID,
      toolName: TOOL_NAME,
      canonicalArgsHash: 'other-hash',
      semanticEmbedding: EMBEDDING_C,
      embeddingModel: EMBEDDING_MODEL,
      result: RESULT,
      storedAt: STORED_AT,
      ttlSeconds: TTL_SECONDS,
    }

    const db = buildMockDb({ selectRows: [], selectCandidateRows: [candidateRow] })
    const service = makeService(db)

    // Query vector is EMBEDDING_A, stored vector is EMBEDDING_C → low similarity
    mockEmbed.mockResolvedValueOnce({ embedding: EMBEDDING_A, usage: { tokens: 3 } })

    const hit = await service.get({
      tenantId: TENANT_ID,
      toolName: TOOL_NAME,
      args: ARGS,
      embeddingModel: EMBEDDING_MODEL,
      distanceThreshold: DISTANCE_THRESHOLD,
    })

    expect(hit).toBeUndefined()
  })

  // ── get() — fail-open on DB error ─────────────────────────────────────────

  it('get() — fail-open: returns undefined on DB error, does not propagate', async () => {
    const db = buildMockDb({ selectThrows: true })
    const service = makeService(db)

    await expect(
      service.get({
        tenantId: TENANT_ID,
        toolName: TOOL_NAME,
        args: ARGS,
        embeddingModel: EMBEDDING_MODEL,
        distanceThreshold: DISTANCE_THRESHOLD,
      }),
    ).resolves.toBeUndefined()
  })

  // ── get() — fail-open on embedding provider error ─────────────────────────

  it('get() — fail-open: returns undefined when embed() throws', async () => {
    // Exact miss → then embedding fails
    const db = buildMockDb({ selectRows: [], selectCandidateRows: [] })
    const service = makeService(db)

    mockEmbed.mockRejectedValueOnce(new Error('OpenAI timeout'))

    await expect(
      service.get({
        tenantId: TENANT_ID,
        toolName: TOOL_NAME,
        args: ARGS,
        embeddingModel: EMBEDDING_MODEL,
        distanceThreshold: DISTANCE_THRESHOLD,
      }),
    ).resolves.toBeUndefined()
  })

  // ── put() — exact-only when embedding provider fails ─────────────────────

  it('put() — stores row without embedding when embed() fails', async () => {
    const db = buildMockDb({})
    const service = makeService(db)

    mockEmbed.mockRejectedValueOnce(new Error('OpenAI unavailable'))

    await service.put({
      tenantId: TENANT_ID,
      toolName: TOOL_NAME,
      args: ARGS,
      result: RESULT,
      ttlSeconds: TTL_SECONDS,
      embeddingModel: EMBEDDING_MODEL,
    })

    expect(db._values).toHaveBeenCalledTimes(1)
    const insertedRow = db._values.mock.calls[0]?.[0] as Record<string, unknown>
    expect(insertedRow['semanticEmbedding']).toBeNull()
    expect(insertedRow['result']).toEqual(RESULT)
    expect(insertedRow['tenantId']).toBe(TENANT_ID)
    expect(insertedRow['toolName']).toBe(TOOL_NAME)
  })

  // ── put() — non-fatal on DB error ─────────────────────────────────────────

  it('put() — resolves without throwing even if DB throws', async () => {
    const db = buildMockDb({ insertThrows: true })
    const service = makeService(db)

    mockEmbed.mockResolvedValueOnce({ embedding: EMBEDDING_A, usage: { tokens: 3 } })

    await expect(
      service.put({
        tenantId: TENANT_ID,
        toolName: TOOL_NAME,
        args: ARGS,
        result: RESULT,
        ttlSeconds: TTL_SECONDS,
        embeddingModel: EMBEDDING_MODEL,
      }),
    ).resolves.toBeUndefined()
  })

  // ── invalidateDomain() — returns purged count ─────────────────────────────

  it('invalidateDomain() — returns purged count from DB delete', async () => {
    const db = buildMockDb({ deleteResult: { rowCount: 5 } })
    const service = makeService(db)

    const result = await service.invalidateDomain({ tenantId: TENANT_ID, domain: 'projects' })

    expect(result).toEqual({ purgedCount: 5 })
  })

  // ── invalidateDomain() — returns 0 on error ───────────────────────────────

  it('invalidateDomain() — returns { purgedCount: 0 } on DB error', async () => {
    const db = buildMockDb({ deleteThrows: true })
    const service = makeService(db)

    const result = await service.invalidateDomain({ tenantId: TENANT_ID, domain: 'projects' })

    expect(result).toEqual({ purgedCount: 0 })
  })
})
