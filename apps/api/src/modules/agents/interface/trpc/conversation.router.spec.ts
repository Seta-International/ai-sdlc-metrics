/**
 * conversation.router.spec.ts — Plan 04 conversations tRPC router
 *
 * Covers: listGlobal (cursor-paginated), listBySurface, getById, archive.
 * All procedures use permission meta only — no agent meta.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { conversationRouter, setConversationRepository } from './conversation.router'
import type { ConversationRepository } from '../../domain/repositories/conversation.repository'
import type { ConversationEntity } from '../../domain/entities/conversation.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const USER_ID = '01900000-0000-7000-8000-000000000002'
const CONV_ID = '01900000-0000-7000-8000-000000000099'

function makeCtx() {
  return {
    req: { headers: {} as Record<string, string | undefined> },
    tenantId: TENANT_ID,
    actorId: USER_ID,
  }
}

function makeConv(overrides?: Partial<ConversationEntity>): ConversationEntity {
  return {
    id: CONV_ID,
    tenantId: TENANT_ID,
    userId: USER_ID,
    surface: 'global-chat',
    status: 'active',
    title: null,
    lastUserTurnAt: null,
    updatedAt: new Date('2026-01-01'),
    archivedAt: null,
    summaryFailureStreak: 0,
    summaryDisabledAt: null,
    ...overrides,
  }
}

function makeRepo(): ConversationRepository {
  return {
    loadOrCreateActive: vi.fn(),
    loadById: vi.fn().mockResolvedValue(makeConv()),
    archive: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    listGlobal: vi.fn().mockResolvedValue([makeConv()]),
    listBySurface: vi.fn().mockResolvedValue([makeConv()]),
    incrementSummaryFailureStreak: vi.fn(),
    resetSummaryFailureStreak: vi.fn(),
    setSummaryDisabled: vi.fn(),
    clearSummaryDisabled: vi.fn(),
    updateTitle: vi.fn(),
    touchLastUserTurn: vi.fn(),
    archiveIdleConversations: vi.fn(),
  }
}

describe('conversationRouter', () => {
  let repo: ConversationRepository

  beforeEach(() => {
    repo = makeRepo()
    setConversationRepository(repo)
  })

  // ── listGlobal ───────────────────────────────────────────────────────────────

  it('listGlobal — calls repo.listGlobal with tenantId + userId from context', async () => {
    const caller = conversationRouter.createCaller(makeCtx())
    const result = await caller.listGlobal({ limit: 10 })

    expect(repo.listGlobal).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      userId: USER_ID,
      limit: 10,
      cursor: undefined,
    })
    expect(result).toHaveLength(1)
  })

  it('listGlobal — passes cursor when provided', async () => {
    const caller = conversationRouter.createCaller(makeCtx())
    await caller.listGlobal({ limit: 5, cursor: CONV_ID })

    expect(repo.listGlobal).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      userId: USER_ID,
      limit: 5,
      cursor: CONV_ID,
    })
  })

  // ── listBySurface ────────────────────────────────────────────────────────────

  it('listBySurface — returns conversations for the given surface', async () => {
    ;(repo.listBySurface as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeConv({ surface: 'inline' }),
    ])
    const caller = conversationRouter.createCaller(makeCtx())
    const result = await caller.listBySurface({ surface: 'inline' })

    expect(repo.listBySurface).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      userId: USER_ID,
      surface: 'inline',
    })
    expect(result[0]?.surface).toBe('inline')
  })

  // ── getById ──────────────────────────────────────────────────────────────────

  it('getById — returns conversation when found', async () => {
    const caller = conversationRouter.createCaller(makeCtx())
    const result = await caller.getById({ id: CONV_ID })

    expect(repo.loadById).toHaveBeenCalledWith({ id: CONV_ID, tenantId: TENANT_ID })
    expect(result?.id).toBe(CONV_ID)
  })

  it('getById — returns null when not found', async () => {
    ;(repo.loadById as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    const caller = conversationRouter.createCaller(makeCtx())
    const result = await caller.getById({ id: CONV_ID })
    expect(result).toBeNull()
  })

  // ── archive ──────────────────────────────────────────────────────────────────

  it('archive — calls repo.archive with id and tenantId', async () => {
    const caller = conversationRouter.createCaller(makeCtx())
    await caller.archive({ id: CONV_ID })

    expect(repo.archive).toHaveBeenCalledWith({ id: CONV_ID, tenantId: TENANT_ID })
  })

  // ── agent-immunity guard ──────────────────────────────────────────────────────

  it('procedures have no agent meta', () => {
    const def = conversationRouter._def
    for (const [name, proc] of Object.entries(def.procedures)) {
      const meta = (proc as { _def?: { meta?: { agent?: unknown } } })._def?.meta
      expect(meta?.agent, `${name} must not have agent meta`).toBeUndefined()
    }
  })
})
