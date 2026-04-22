/**
 * save-queue.spec.ts — unit tests for SaveQueue (R-04.23)
 *
 * Covers:
 *  1. Two enqueues 50ms apart → one flush (debounce coalesces)
 *  2. Two enqueues 200ms apart → two flushes (debounce fires for each)
 *  3. Enqueue then wait 1.1s without further enqueues → flush fires (staleness cap)
 *  4. flushByConversation() forces flush regardless of timer
 *  5. drain() flushes everything
 *  6. Per-conversation serialization: concurrent messages for the same conversation flush in order
 *  7. Messages for different conversations flush independently (parallel)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SaveQueue } from './save-queue'
import type { ConversationMessageRepository } from '../../domain/repositories/conversation-message.repository'
import type { ConversationMessageEntity } from '../../domain/entities/conversation-message.entity'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMessage(
  overrides: Partial<Omit<ConversationMessageEntity, 'id' | 'createdAt'>> = {},
): Omit<ConversationMessageEntity, 'id' | 'createdAt'> {
  return {
    conversationId: 'conv-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    role: 'user',
    content: { text: 'hello' },
    summary: null,
    traceId: 'trace-1',
    ...overrides,
  }
}

function makeRepo(): ConversationMessageRepository {
  return {
    persist: vi.fn(),
    persistMany: vi.fn().mockResolvedValue([]),
    listForWindow: vi.fn(),
    updateSummary: vi.fn(),
    hardDeleteContent: vi.fn(),
    search: vi.fn(),
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SaveQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ─── 1. Debounce coalesces ──────────────────────────────────────────────────

  describe('debounce coalescing', () => {
    it('two enqueues 50ms apart produce one flush', async () => {
      const repo = makeRepo()
      const queue = new SaveQueue(repo)

      queue.enqueue({ conversationId: 'conv-1', tenantId: 'tenant-1', message: makeMessage() })

      await vi.advanceTimersByTimeAsync(50)

      queue.enqueue({ conversationId: 'conv-1', tenantId: 'tenant-1', message: makeMessage() })

      // Advance past the debounce window (100ms from last enqueue)
      await vi.advanceTimersByTimeAsync(150)

      expect(repo.persistMany).toHaveBeenCalledTimes(1)
      const call = (repo.persistMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(call.messages).toHaveLength(2)
    })

    it('two enqueues 200ms apart produce two flushes', async () => {
      const repo = makeRepo()
      const queue = new SaveQueue(repo)

      queue.enqueue({ conversationId: 'conv-1', tenantId: 'tenant-1', message: makeMessage() })

      // Let the debounce fire for the first enqueue (advance 150ms)
      await vi.advanceTimersByTimeAsync(150)
      expect(repo.persistMany).toHaveBeenCalledTimes(1)

      queue.enqueue({ conversationId: 'conv-1', tenantId: 'tenant-1', message: makeMessage() })

      // Let the debounce fire for the second enqueue
      await vi.advanceTimersByTimeAsync(150)
      expect(repo.persistMany).toHaveBeenCalledTimes(2)
    })
  })

  // ─── 2. Staleness cap (1s) ─────────────────────────────────────────────────

  describe('staleness cap', () => {
    it('enqueue then wait 1.1s without further enqueues → flush fires', async () => {
      const repo = makeRepo()
      const queue = new SaveQueue(repo)

      queue.enqueue({ conversationId: 'conv-1', tenantId: 'tenant-1', message: makeMessage() })

      // Advance 1100ms — staleness cap fires before 100ms debounce would also fire,
      // but either way a flush must occur
      await vi.advanceTimersByTimeAsync(1100)

      expect(repo.persistMany).toHaveBeenCalledTimes(1)
    })

    it('staleness flush happens at 1s even if debounce is reset mid-way', async () => {
      const repo = makeRepo()
      const queue = new SaveQueue(repo)

      // Enqueue at t=0
      queue.enqueue({ conversationId: 'conv-1', tenantId: 'tenant-1', message: makeMessage() })

      // Re-enqueue at t=90ms (resets debounce but NOT the staleness cap)
      await vi.advanceTimersByTimeAsync(90)
      queue.enqueue({ conversationId: 'conv-1', tenantId: 'tenant-1', message: makeMessage() })

      // At t=1000ms, staleness cap fires (first message is 1s old)
      await vi.advanceTimersByTimeAsync(910) // total elapsed = 1000ms

      expect(repo.persistMany).toHaveBeenCalledTimes(1)
      const call = (repo.persistMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(call.messages).toHaveLength(2)
    })
  })

  // ─── 3. flushByConversation forces flush regardless of timer ───────────────

  describe('flushByConversation()', () => {
    it('forces flush before debounce timer fires', async () => {
      const repo = makeRepo()
      const queue = new SaveQueue(repo)

      queue.enqueue({ conversationId: 'conv-1', tenantId: 'tenant-1', message: makeMessage() })

      // Force flush immediately — debounce is still pending
      await queue.flushByConversation('conv-1')

      expect(repo.persistMany).toHaveBeenCalledTimes(1)
    })

    it('resolves even when queue is empty', async () => {
      const repo = makeRepo()
      const queue = new SaveQueue(repo)

      await expect(queue.flushByConversation('conv-empty')).resolves.toBeUndefined()
      expect(repo.persistMany).not.toHaveBeenCalled()
    })

    it('no duplicate flush after forced flush if debounce timer fires later', async () => {
      const repo = makeRepo()
      const queue = new SaveQueue(repo)

      queue.enqueue({ conversationId: 'conv-1', tenantId: 'tenant-1', message: makeMessage() })

      await queue.flushByConversation('conv-1')
      expect(repo.persistMany).toHaveBeenCalledTimes(1)

      // Advance past the debounce window — should not flush again (buffer was already cleared)
      await vi.advanceTimersByTimeAsync(200)
      expect(repo.persistMany).toHaveBeenCalledTimes(1)
    })
  })

  // ─── 4. drain() ────────────────────────────────────────────────────────────

  describe('drain()', () => {
    it('flushes all pending queues for all conversations', async () => {
      const repo = makeRepo()
      const queue = new SaveQueue(repo)

      queue.enqueue({
        conversationId: 'conv-1',
        tenantId: 'tenant-1',
        message: makeMessage({ conversationId: 'conv-1' }),
      })
      queue.enqueue({
        conversationId: 'conv-2',
        tenantId: 'tenant-1',
        message: makeMessage({ conversationId: 'conv-2' }),
      })

      await queue.drain()

      expect(repo.persistMany).toHaveBeenCalledTimes(2)
    })

    it('drain() on empty queue resolves without calling persistMany', async () => {
      const repo = makeRepo()
      const queue = new SaveQueue(repo)

      await queue.drain()

      expect(repo.persistMany).not.toHaveBeenCalled()
    })

    it('enqueues after drain() work correctly', async () => {
      const repo = makeRepo()
      const queue = new SaveQueue(repo)

      queue.enqueue({ conversationId: 'conv-1', tenantId: 'tenant-1', message: makeMessage() })
      await queue.drain()
      expect(repo.persistMany).toHaveBeenCalledTimes(1)

      // New enqueue after drain
      queue.enqueue({ conversationId: 'conv-1', tenantId: 'tenant-1', message: makeMessage() })
      await queue.drain()
      expect(repo.persistMany).toHaveBeenCalledTimes(2)
    })
  })

  // ─── 5. Per-conversation serialization ─────────────────────────────────────

  describe('per-conversation serialization', () => {
    it('flushes for same conversation are sequential (ordered)', async () => {
      const order: string[] = []
      let resolveFirst!: () => void

      const repo = makeRepo()
      ;(repo.persistMany as ReturnType<typeof vi.fn>).mockImplementation(
        (_opts: { conversationId: string; tenantId: string; messages: unknown[] }) => {
          return new Promise<ConversationMessageEntity[]>((resolve) => {
            if (order.length === 0) {
              order.push('first-start')
              resolveFirst = () => {
                order.push('first-end')
                resolve([])
              }
            } else {
              order.push('second-start')
              resolve([])
              order.push('second-end')
            }
          })
        },
      )

      const queue = new SaveQueue(repo)

      queue.enqueue({ conversationId: 'conv-1', tenantId: 'tenant-1', message: makeMessage() })

      // Trigger first flush
      const firstFlush = queue.flushByConversation('conv-1')

      // Let microtasks settle so the first persistMany is called and buffer is cleared
      await Promise.resolve()

      // Now the first flush's persistMany is in-flight (hanging). Buffer is cleared.
      // Enqueue second message — it lands in a fresh buffer entry.
      queue.enqueue({ conversationId: 'conv-1', tenantId: 'tenant-1', message: makeMessage() })
      const secondFlush = queue.flushByConversation('conv-1')

      // Second flush must not start until first finishes (mutex chain ensures serialization)
      expect(order).toEqual(['first-start'])

      // Resolve the first flush
      resolveFirst()
      await firstFlush

      // Now second should have started and completed
      await secondFlush

      expect(order).toEqual(['first-start', 'first-end', 'second-start', 'second-end'])
    })
  })

  // ─── 6. Different conversations flush independently ─────────────────────────

  describe('cross-conversation independence', () => {
    it('flushes for different conversations are independent (not serialized)', async () => {
      const callOrder: string[] = []

      const repo = makeRepo()
      ;(repo.persistMany as ReturnType<typeof vi.fn>).mockImplementation(
        async (opts: { conversationId: string; tenantId: string; messages: unknown[] }) => {
          callOrder.push(opts.conversationId)
          return []
        },
      )

      const queue = new SaveQueue(repo)

      queue.enqueue({
        conversationId: 'conv-A',
        tenantId: 'tenant-1',
        message: makeMessage({ conversationId: 'conv-A' }),
      })
      queue.enqueue({
        conversationId: 'conv-B',
        tenantId: 'tenant-1',
        message: makeMessage({ conversationId: 'conv-B' }),
      })

      // Both flush in parallel via drain
      await queue.drain()

      // Both should have flushed; order may vary but both must appear
      expect(callOrder).toContain('conv-A')
      expect(callOrder).toContain('conv-B')
      expect(callOrder).toHaveLength(2)
    })
  })
})
