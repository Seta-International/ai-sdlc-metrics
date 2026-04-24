/**
 * replay-harness.spec.ts — Plan 10 Task 3
 *
 * Covers:
 *  1. mode: 'prompt-only' — all hashes resolved → returns ReplayResult with correct structure
 *  2. Missing router prompt hash → raises ReplayLookupMissError with correct hash + expectedLayer
 *  3. Missing narrative hash → raises ReplayLookupMissError
 *  4. Missing tool catalog hash → raises ReplayLookupMissError
 *  5. Session not found → raises ReplayLookupMissError with expectedLayer: 'session'
 *  6. mode: 'full' with tool invocations → includes toolOutputs
 *  7. mode: 'full' with missing tool output (resultPreview null + no resultHash) → raises ReplayToolOutputMissError
 */

import { describe, it, expect, vi } from 'vitest'
import { ReplayHarness, ReplayLookupMissError, ReplayToolOutputMissError } from './replay-harness'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TRACE_ID = '01900000-0000-7000-8000-000000000001'
const TENANT_ID = '01900000-0000-7000-8000-000000000002'
const USER_ID = '01900000-0000-7000-8000-000000000003'
const CONVERSATION_ID = '01900000-0000-7000-8000-000000000004'

const ROUTER_HASH = 'sha256-router-aabbcc'
const NARRATIVE_HASH = 'sha256-narrative-ddeeff'
const TOOL_CATALOG_HASH = 'sha256-toolcatalog-112233'
const DIRECTIVE_SCHEMA_HASH = 'sha256-directive-445566'
const CANONICALIZER_VERSION_HASH = 'sha256-canonicalizer-778899'

const mockSession = {
  id: 'session-id-1',
  tenantId: TENANT_ID,
  userId: USER_ID,
  conversationId: CONVERSATION_ID,
  routerPromptHash: ROUTER_HASH,
  permissionNarrativeHash: NARRATIVE_HASH,
  toolCatalogHash: TOOL_CATALOG_HASH,
  directiveSchemaHash: DIRECTIVE_SCHEMA_HASH,
  canonicalizerVersionHash: CANONICALIZER_VERSION_HASH,
  pinnedSubAgentPromptHashes: {},
  startedAt: new Date('2026-01-01T00:00:00Z'),
  endedAt: null,
}

const mockMessageRow = {
  id: 'msg-id-1',
  conversationId: CONVERSATION_ID,
  tenantId: TENANT_ID,
  userId: USER_ID,
  role: 'user',
  content: { text: 'Hello, what is my leave balance?' },
  summary: null,
  traceId: TRACE_ID,
  createdAt: new Date('2026-01-01T00:00:00Z'),
}

const mockRouterPromptEntry = {
  contentHash: ROUTER_HASH,
  layer: 'router' as const,
  content: 'You are a Future HR assistant.',
  tenantId: TENANT_ID,
  firstSeenAt: new Date('2026-01-01T00:00:00Z'),
}

const mockNarrativeEntry = {
  contentHash: NARRATIVE_HASH,
  tenantId: TENANT_ID,
  roleKey: 'employee',
  content: 'User has permission to view own leave balance.',
  firstSeenAt: new Date('2026-01-01T00:00:00Z'),
}

const mockToolCatalogEntry = {
  contentHash: TOOL_CATALOG_HASH,
  layer: 'tool_catalog' as const,
  content: 'Available tools: leave.getBalance',
  tenantId: TENANT_ID,
  firstSeenAt: new Date('2026-01-01T00:00:00Z'),
}

// ─── Mock factory helpers ──────────────────────────────────────────────────────

/**
 * Builds a DB mock that returns:
 *  - First select (agent_message WHERE role='user'): messageRows
 *  - Second select (agent_tool_invocation WHERE traceId): toolRows
 */
function buildDb(messageRows: Record<string, unknown>[], toolRows: Record<string, unknown>[] = []) {
  let selectCallCount = 0

  const limitMock = vi.fn().mockImplementation(() => {
    // first select is the message lookup (has .limit)
    return Promise.resolve(messageRows)
  })

  const whereMock = vi.fn().mockImplementation(() => {
    selectCallCount++
    if (selectCallCount === 1) {
      // agent_message lookup — has .limit()
      return { limit: limitMock }
    }
    // agent_tool_invocation lookup — no .limit(), resolves directly
    return Promise.resolve(toolRows)
  })

  const fromMock = vi.fn().mockReturnValue({ where: whereMock })
  const selectMock = vi.fn().mockReturnValue({ from: fromMock })

  return { db: { select: selectMock } as never }
}

function buildSessionPort(session: typeof mockSession | null) {
  return {
    findByConversation: vi.fn().mockResolvedValue(session),
    create: vi.fn(),
    endSession: vi.fn(),
  }
}

function buildPromptStore(
  routerEntry: typeof mockRouterPromptEntry | null,
  toolCatalogEntry: typeof mockToolCatalogEntry | null,
  subAgentEntries: Record<string, typeof mockRouterPromptEntry | null> = {},
) {
  return {
    get: vi.fn().mockImplementation((hash: string) => {
      if (hash === ROUTER_HASH) return Promise.resolve(routerEntry)
      if (hash === TOOL_CATALOG_HASH) return Promise.resolve(toolCatalogEntry)
      if (hash in subAgentEntries) return Promise.resolve(subAgentEntries[hash])
      return Promise.resolve(null)
    }),
    appendIfMissing: vi.fn(),
  }
}

function buildNarrativeStore(entry: typeof mockNarrativeEntry | null) {
  return {
    get: vi.fn().mockResolvedValue(entry),
    appendIfMissing: vi.fn(),
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ReplayHarness', () => {
  it("1. mode 'prompt-only' — all hashes resolved → returns ReplayResult with correct structure", async () => {
    const { db } = buildDb([mockMessageRow])
    const sessionPort = buildSessionPort(mockSession)
    const promptStore = buildPromptStore(mockRouterPromptEntry, mockToolCatalogEntry)
    const narrativeStore = buildNarrativeStore(mockNarrativeEntry)

    const harness = new ReplayHarness(
      db,
      promptStore as never,
      narrativeStore as never,
      sessionPort as never,
    )
    const result = await harness.replay({ traceId: TRACE_ID, mode: 'prompt-only' })

    expect(result.messages).toHaveLength(1)
    expect(result.messages[0]).toHaveLength(2)
    expect(result.messages[0][0]).toMatchObject({ role: 'system' })
    expect(result.messages[0][1]).toMatchObject({
      role: 'user',
      content: 'Hello, what is my leave balance?',
    })
    expect(result.pinnedVersions).toMatchObject({
      routerPrompt: ROUTER_HASH,
      permissionNarrative: NARRATIVE_HASH,
      toolCatalog: TOOL_CATALOG_HASH,
    })
    expect(result.canonicalizerVersionHash).toBe(CANONICALIZER_VERSION_HASH)
    expect(result.toolOutputs).toBeUndefined()
  })

  it('2. Missing router prompt hash → raises ReplayLookupMissError with correct hash + expectedLayer', async () => {
    const { db } = buildDb([mockMessageRow])
    const sessionPort = buildSessionPort(mockSession)
    const promptStore = buildPromptStore(null, mockToolCatalogEntry) // router returns null
    const narrativeStore = buildNarrativeStore(mockNarrativeEntry)

    const harness = new ReplayHarness(
      db,
      promptStore as never,
      narrativeStore as never,
      sessionPort as never,
    )

    await expect(harness.replay({ traceId: TRACE_ID, mode: 'prompt-only' })).rejects.toSatisfy(
      (err: unknown) => {
        if (!(err instanceof ReplayLookupMissError)) return false
        return (
          err.hash === ROUTER_HASH && err.expectedLayer === 'router' && err.traceId === TRACE_ID
        )
      },
    )
  })

  it('3. Missing narrative hash → raises ReplayLookupMissError', async () => {
    const { db } = buildDb([mockMessageRow])
    const sessionPort = buildSessionPort(mockSession)
    const promptStore = buildPromptStore(mockRouterPromptEntry, mockToolCatalogEntry)
    const narrativeStore = buildNarrativeStore(null) // narrative returns null

    const harness = new ReplayHarness(
      db,
      promptStore as never,
      narrativeStore as never,
      sessionPort as never,
    )

    await expect(harness.replay({ traceId: TRACE_ID, mode: 'prompt-only' })).rejects.toSatisfy(
      (err: unknown) => {
        if (!(err instanceof ReplayLookupMissError)) return false
        return (
          err.hash === NARRATIVE_HASH &&
          err.expectedLayer === 'permission_narrative' &&
          err.traceId === TRACE_ID
        )
      },
    )
  })

  it('4. Missing tool catalog hash → raises ReplayLookupMissError', async () => {
    const { db } = buildDb([mockMessageRow])
    const sessionPort = buildSessionPort(mockSession)
    const promptStore = buildPromptStore(mockRouterPromptEntry, null) // tool catalog returns null
    const narrativeStore = buildNarrativeStore(mockNarrativeEntry)

    const harness = new ReplayHarness(
      db,
      promptStore as never,
      narrativeStore as never,
      sessionPort as never,
    )

    await expect(harness.replay({ traceId: TRACE_ID, mode: 'prompt-only' })).rejects.toSatisfy(
      (err: unknown) => {
        if (!(err instanceof ReplayLookupMissError)) return false
        return (
          err.hash === TOOL_CATALOG_HASH &&
          err.expectedLayer === 'tool_catalog' &&
          err.traceId === TRACE_ID
        )
      },
    )
  })

  it("5. Session not found → raises ReplayLookupMissError with expectedLayer: 'session'", async () => {
    const { db } = buildDb([mockMessageRow])
    const sessionPort = buildSessionPort(null) // session not found
    const promptStore = buildPromptStore(mockRouterPromptEntry, mockToolCatalogEntry)
    const narrativeStore = buildNarrativeStore(mockNarrativeEntry)

    const harness = new ReplayHarness(
      db,
      promptStore as never,
      narrativeStore as never,
      sessionPort as never,
    )

    await expect(harness.replay({ traceId: TRACE_ID, mode: 'prompt-only' })).rejects.toSatisfy(
      (err: unknown) => {
        if (!(err instanceof ReplayLookupMissError)) return false
        return err.expectedLayer === 'session' && err.traceId === TRACE_ID
      },
    )
  })

  it("6. mode 'full' with tool invocations → includes toolOutputs", async () => {
    const resultData = JSON.stringify({ balance: 10 })
    const toolRow = {
      id: 'inv-1',
      traceId: TRACE_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      toolName: 'leave.getBalance',
      args: { userId: USER_ID },
      resultPreview: Buffer.from(resultData, 'utf8'),
      resultHash: 'sha256-result-abc',
      byteCount: resultData.length,
      resultStatus: 'success',
      subAgentKey: null,
      phase: 1,
      iteration: null,
      createdAt: new Date('2026-01-01T00:00:01Z'),
    }

    const { db } = buildDb([mockMessageRow], [toolRow])
    const sessionPort = buildSessionPort(mockSession)
    const promptStore = buildPromptStore(mockRouterPromptEntry, mockToolCatalogEntry)
    const narrativeStore = buildNarrativeStore(mockNarrativeEntry)

    const harness = new ReplayHarness(
      db,
      promptStore as never,
      narrativeStore as never,
      sessionPort as never,
    )
    const result = await harness.replay({ traceId: TRACE_ID, mode: 'full' })

    expect(result.toolOutputs).toHaveLength(1)
    expect(result.toolOutputs![0]).toMatchObject({
      toolName: 'leave.getBalance',
      args: { userId: USER_ID },
      result: { balance: 10 },
    })
  })

  it("7. mode 'full' with missing tool output → raises ReplayToolOutputMissError", async () => {
    const toolRow = {
      id: 'inv-2',
      traceId: TRACE_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      toolName: 'leave.getBalance',
      args: { userId: USER_ID },
      resultPreview: null, // not captured
      resultHash: null, // no hash either
      byteCount: null,
      resultStatus: 'pending',
      subAgentKey: null,
      phase: 1,
      iteration: null,
      createdAt: new Date('2026-01-01T00:00:01Z'),
    }

    const { db } = buildDb([mockMessageRow], [toolRow])
    const sessionPort = buildSessionPort(mockSession)
    const promptStore = buildPromptStore(mockRouterPromptEntry, mockToolCatalogEntry)
    const narrativeStore = buildNarrativeStore(mockNarrativeEntry)

    const harness = new ReplayHarness(
      db,
      promptStore as never,
      narrativeStore as never,
      sessionPort as never,
    )

    await expect(harness.replay({ traceId: TRACE_ID, mode: 'full' })).rejects.toSatisfy(
      (err: unknown) => {
        if (!(err instanceof ReplayToolOutputMissError)) return false
        return err.toolName === 'leave.getBalance' && err.traceId === TRACE_ID
      },
    )
  })
})
