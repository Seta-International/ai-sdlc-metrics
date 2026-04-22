import { Injectable, Inject } from '@nestjs/common'
import type { ConversationMessageEntity } from '../../domain/entities/conversation-message.entity'
import type { ConversationMessageRepository } from '../../domain/repositories/conversation-message.repository'
import { CONVERSATION_MESSAGE_REPOSITORY } from '../../domain/repositories/conversation-message.repository'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EnqueueOpts {
  conversationId: string
  tenantId: string
  message: Omit<ConversationMessageEntity, 'id' | 'createdAt'>
}

interface QueueEntry {
  /** Time the first message in this batch was enqueued (used for staleness cap). */
  oldestAt: number
  tenantId: string
  messages: Array<Omit<ConversationMessageEntity, 'id' | 'createdAt'>>
  /** Pending debounce timer handle. */
  debounceTimer: ReturnType<typeof setTimeout> | null
  /** Pending staleness-cap timer handle. */
  stalenessTimer: ReturnType<typeof setTimeout> | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 100
const STALENESS_MS = 1_000

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * SaveQueue — debounced write queue for persisting agent conversation messages.
 *
 * Behaviour (R-04.23):
 * - 100ms debounce per conversationId: messages arriving within 100ms of each
 *   other coalesce into one flush call.
 * - 1s staleness cap: if the oldest buffered message has been waiting longer
 *   than 1s, a flush is forced regardless of debounce state.
 * - Per-conversation serialization: flushes for the same conversationId are
 *   chained sequentially via a promise mutex so they never interleave.
 * - flushByConversation(id): forced flush (called at turn.ended).
 * - drain(): flush all queues (called on shutdown).
 */
@Injectable()
export class SaveQueue {
  /** Buffered messages per conversationId. */
  private readonly buffers = new Map<string, QueueEntry>()

  /**
   * Per-conversation mutex: a promise chain that ensures sequential flushing
   * for the same conversationId.
   */
  private readonly mutexes = new Map<string, Promise<void>>()

  constructor(
    @Inject(CONVERSATION_MESSAGE_REPOSITORY)
    private readonly repo: ConversationMessageRepository,
  ) {}

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Add a message to the debounced write queue.
   *
   * Never throws — callers are fire-and-forget.
   */
  enqueue(opts: EnqueueOpts): void {
    const { conversationId, tenantId, message } = opts
    const now = Date.now()

    let entry = this.buffers.get(conversationId)

    if (!entry) {
      entry = {
        oldestAt: now,
        tenantId,
        messages: [],
        debounceTimer: null,
        stalenessTimer: null,
      }
      this.buffers.set(conversationId, entry)

      // Start the staleness-cap timer once per batch (not reset on each enqueue)
      entry.stalenessTimer = setTimeout(() => {
        this.triggerFlush(conversationId)
      }, STALENESS_MS)
    }

    entry.messages.push(message)

    // Reset the debounce timer on every enqueue
    if (entry.debounceTimer !== null) {
      clearTimeout(entry.debounceTimer)
    }
    entry.debounceTimer = setTimeout(() => {
      this.triggerFlush(conversationId)
    }, DEBOUNCE_MS)
  }

  /**
   * Force flush the queue for a specific conversation regardless of timers.
   *
   * Called at `turn.ended`. Always awaitable; resolves when the flush
   * completes (including any previously in-flight flushes).
   */
  async flushByConversation(conversationId: string): Promise<void> {
    return this.triggerFlush(conversationId)
  }

  /**
   * Flush all pending queues. Called on shutdown.
   *
   * Different conversations flush in parallel (independent). Within each
   * conversation, the flush is still serialized via the per-conversation mutex.
   */
  async drain(): Promise<void> {
    const conversationIds = [...this.buffers.keys()]
    await Promise.all(conversationIds.map((id) => this.triggerFlush(id)))
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  /**
   * Schedule a flush for a conversationId, chaining it onto the per-conversation
   * mutex so flushes never interleave for the same conversation.
   */
  private triggerFlush(conversationId: string): Promise<void> {
    const previous = this.mutexes.get(conversationId) ?? Promise.resolve()

    const next = previous.then(() => this.executeFlush(conversationId))

    // Store the tail of the chain; errors must not break the chain
    this.mutexes.set(
      conversationId,
      next.catch(() => undefined),
    )

    return next
  }

  /**
   * Consume the current buffer for a conversation and persist it.
   *
   * Called exclusively from within the per-conversation mutex chain.
   */
  private async executeFlush(conversationId: string): Promise<void> {
    const entry = this.buffers.get(conversationId)

    if (!entry || entry.messages.length === 0) {
      // Nothing to flush — clean up timers if the entry still exists
      if (entry) {
        this.cancelTimers(entry)
        this.buffers.delete(conversationId)
      }
      return
    }

    // Snapshot and clear the buffer atomically (before the async persist)
    const { tenantId, messages } = entry
    this.cancelTimers(entry)
    this.buffers.delete(conversationId)

    await this.repo.persistMany({ conversationId, tenantId, messages })
  }

  private cancelTimers(entry: QueueEntry): void {
    if (entry.debounceTimer !== null) {
      clearTimeout(entry.debounceTimer)
      entry.debounceTimer = null
    }
    if (entry.stalenessTimer !== null) {
      clearTimeout(entry.stalenessTimer)
      entry.stalenessTimer = null
    }
  }
}
