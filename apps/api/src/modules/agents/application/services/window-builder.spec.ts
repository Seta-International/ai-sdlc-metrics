/**
 * window-builder.spec.ts — Plan 04 §11 unit tests for WindowBuilder
 *
 * All 9 required test cases from the plan spec are covered.
 * No NestJS DI — WindowBuilder is instantiated directly with a mocked repository.
 *
 * γ (global) window: last 3 verbatim + last 10 compressed + rolling summary
 * α (inline) window: last 5 verbatim, compressed=[], rolling=null
 *
 * See: R-04.11, R-04.12, R-04.13, R-04.14, R-04.26b, R-04.26c
 */

import { describe, it, expect, vi } from 'vitest'
import { WindowBuilder } from './window-builder'
import type { ConversationMessageRepository } from '../../domain/repositories/conversation-message.repository'
import type { ConversationMessageEntity } from '../../domain/entities/conversation-message.entity'

// ─── Constants ────────────────────────────────────────────────────────────────

const CONVERSATION_ID = '01900000-0000-7000-8000-000000000001'
const TENANT_ID = '01900000-0000-7000-8000-000000000002'
const DELIMITER_OPEN = '<conversation_summary source="post_turn_nano">'
const DELIMITER_CLOSE = '</conversation_summary>'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMessage(
  overrides: Partial<ConversationMessageEntity> & { index: number },
): ConversationMessageEntity {
  return {
    id: `msg-${overrides.index.toString().padStart(3, '0')}`,
    conversationId: CONVERSATION_ID,
    tenantId: TENANT_ID,
    userId: 'user-001',
    role: 'user',
    content: { text: `Message ${overrides.index}` },
    summary: `Summary for turn ${overrides.index}`,
    traceId: `trace-${overrides.index.toString().padStart(3, '0')}`,
    createdAt: new Date(2026, 0, 1, 0, overrides.index, 0),
    ...overrides,
  }
}

/**
 * Build N user messages with summaries, ordered oldest → newest (index 1..N).
 * listForWindow returns newest → oldest, so we reverse the array.
 */
function makeMessages(count: number): ConversationMessageEntity[] {
  const messages: ConversationMessageEntity[] = []
  for (let i = 1; i <= count; i++) {
    messages.push(makeMessage({ index: i }))
  }
  // Return newest first (as the repo would)
  return messages.reverse()
}

function makeMockRepo(messages: ConversationMessageEntity[]): ConversationMessageRepository {
  return {
    listForWindow: vi.fn().mockResolvedValue(messages),
    persist: vi.fn(),
    persistMany: vi.fn(),
    updateSummary: vi.fn(),
    hardDeleteContent: vi.fn(),
    search: vi.fn(),
  } as unknown as ConversationMessageRepository
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WindowBuilder', () => {
  // ── γ (global) window ──────────────────────────────────────────────────────

  describe('buildGlobal (γ window)', () => {
    it('verbatim count is exactly 3 (from last 3 user turns with summaries)', async () => {
      // 20 messages with summaries — only last 3 in verbatim
      const repo = makeMockRepo(makeMessages(20))
      const builder = new WindowBuilder(repo)

      const window = await builder.buildGlobal({
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
      })

      expect(window.verbatim).toHaveLength(3)
    })

    it('compressed count is exactly 10 (oldest 10 summaries after verbatim tier)', async () => {
      // Need 13+ messages so there are 10 beyond the 3 verbatim
      const repo = makeMockRepo(makeMessages(20))
      const builder = new WindowBuilder(repo)

      const window = await builder.buildGlobal({
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
      })

      expect(window.compressed).toHaveLength(10)
    })

    it('rolling is a non-null string when there are enough turns', async () => {
      const repo = makeMockRepo(makeMessages(20))
      const builder = new WindowBuilder(repo)

      const window = await builder.buildGlobal({
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
      })

      expect(window.rolling).not.toBeNull()
      expect(typeof window.rolling).toBe('string')
      expect((window.rolling as string).length).toBeGreaterThan(0)
    })

    it('rolling summary is null when conversation has fewer than 3 turns (R-04.26c)', async () => {
      // Only 2 messages — below the 3-turn threshold for rolling summary
      const repo = makeMockRepo(makeMessages(2))
      const builder = new WindowBuilder(repo)

      const window = await builder.buildGlobal({
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
      })

      expect(window.rolling).toBeNull()
    })

    it('verbatim entries are wrapped in delimiter tags (R-04.26b)', async () => {
      const repo = makeMockRepo(makeMessages(5))
      const builder = new WindowBuilder(repo)

      const window = await builder.buildGlobal({
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
      })

      for (const entry of window.verbatim) {
        expect(entry.summary).toMatch(new RegExp(`^${escapeRegExp(DELIMITER_OPEN)}`))
        expect(entry.summary).toMatch(new RegExp(`${escapeRegExp(DELIMITER_CLOSE)}$`))
      }
    })

    it('messages with null summary are excluded from verbatim (only messages WITH summaries count)', async () => {
      // Mix: some messages have summary=null, some don't
      const messages: ConversationMessageEntity[] = [
        makeMessage({ index: 5, summary: 'Turn 5 summary' }), // newest
        makeMessage({ index: 4, summary: null }), // no summary — excluded
        makeMessage({ index: 3, summary: 'Turn 3 summary' }),
        makeMessage({ index: 2, summary: null }), // no summary — excluded
        makeMessage({ index: 1, summary: 'Turn 1 summary' }),
      ]
      const repo = makeMockRepo(messages)
      const builder = new WindowBuilder(repo)

      const window = await builder.buildGlobal({
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
      })

      // Only 3 messages have summaries, verbatim takes the last 3 of those
      expect(window.verbatim).toHaveLength(3)
      // Verify they're the ones with actual summaries (indices 5, 3, 1)
      for (const entry of window.verbatim) {
        expect(entry.summary).toContain('Turn')
      }
    })

    it('permission-scope filtering: fields not in allowedFields set are dropped from summary content (R-04.14)', async () => {
      // Messages containing sensitive field content in their summaries
      const messages: ConversationMessageEntity[] = [
        makeMessage({ index: 3, summary: 'salary=5000 name=Alice department=Engineering' }),
        makeMessage({ index: 2, summary: 'salary=4500 name=Bob department=Marketing' }),
        makeMessage({ index: 1, summary: 'salary=6000 name=Carol department=HR' }),
      ]
      const repo = makeMockRepo(messages)
      const builder = new WindowBuilder(repo)

      // Only 'name' and 'department' are allowed — 'salary' should be dropped
      const window = await builder.buildGlobal({
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
        allowedFields: new Set(['name', 'department']),
      })

      for (const entry of window.verbatim) {
        expect(entry.summary).not.toContain('salary')
        expect(entry.summary).toContain('name')
        expect(entry.summary).toContain('department')
      }
    })
  })

  // ── α (inline) window ──────────────────────────────────────────────────────

  describe('buildInline (α window)', () => {
    it('verbatim count is exactly 5 (default N)', async () => {
      const repo = makeMockRepo(makeMessages(20))
      const builder = new WindowBuilder(repo)

      const window = await builder.buildInline({
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
      })

      expect(window.verbatim).toHaveLength(5)
    })

    it('compressed is empty array and rolling is null for α windows', async () => {
      const repo = makeMockRepo(makeMessages(20))
      const builder = new WindowBuilder(repo)

      const window = await builder.buildInline({
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
      })

      expect(window.compressed).toEqual([])
      expect(window.rolling).toBeNull()
    })
  })
})

// ─── Utility ──────────────────────────────────────────────────────────────────

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
