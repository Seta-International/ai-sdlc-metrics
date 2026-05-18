import type { KernelMessage, MemoryContext, MemoryProvider, RecallResult } from '@seta/agent-core'
import { recordAudit } from '@seta/audit'
import { type DbSql, withTenant } from '@seta/db'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenancy'
import type { Sql } from 'postgres'
import { actorFromContext } from './audit'
import { MemoryPersistFailedError, WorkingMemoryTooLargeError } from './errors'
import { fetchRecallPage, trimToTokenBudget } from './recall'
import { ensureThread, extractAutoTitle, saveMessages } from './save-turn'
import type { Thread } from './schema'
import type {
  CreateThreadInput,
  DeleteThreadInput,
  GetThreadInput,
  ListThreadsOptions,
  ListThreadsResult,
  SaveThreadArgs,
  SaveThreadInput,
  ThreadPatch,
  UpdateThreadInput,
} from './thread-crud'
import {
  createThread,
  deleteThread,
  getThreadById,
  listThreads,
  saveThread,
  updateThread,
} from './thread-crud'
import {
  readWorkingMemory,
  readWorkingMemoryByResource,
  upsertWorkingMemory,
  upsertWorkingMemoryByResource,
} from './working-memory'

export interface AgentMemoryProviderOptions {
  sql: DbSql
  recallTokenBudget?: number
  recallPageSize?: number
}

const DEFAULT_BUDGET = 4000
const DEFAULT_PAGE_SIZE = 40

export class AgentMemoryProvider implements MemoryProvider {
  constructor(private readonly opts: AgentMemoryProviderOptions) {}

  async recall(ctx: MemoryContext): Promise<RecallResult> {
    const tenantId = tenantContext.getTenantId()
    const pageSize = this.opts.recallPageSize ?? DEFAULT_PAGE_SIZE
    const budget = this.opts.recallTokenBudget ?? DEFAULT_BUDGET

    try {
      return await withTenant(this.opts.sql, tenantId, async (tx) => {
        const page = await fetchRecallPage(tx, ctx.threadId, pageSize)
        const { kept, droppedCount } = trimToTokenBudget(page.messages, budget)

        await recordAudit(tx as unknown as Sql, {
          tenantId,
          actor: actorFromContext(),
          operation: 'memory.recall',
          resource: { type: 'thread', ids: [ctx.threadId] },
          result: 'ok',
          metadata: {
            returned: kept.length,
            dropped: droppedCount,
            hasMore: page.hasMore,
            pageSize,
            budget,
          },
        })

        logger.debug(
          {
            threadId: ctx.threadId,
            returned: kept.length,
            dropped: droppedCount,
            hasMore: page.hasMore,
          },
          'memory.recall',
        )

        return {
          messages: kept,
          total: page.total,
          page: 1,
          perPage: pageSize,
          hasMore: page.hasMore,
        }
      })
    } catch (err) {
      throw new MemoryPersistFailedError(err)
    }
  }

  async saveTurn(ctx: MemoryContext, msgs: KernelMessage[]): Promise<void> {
    const tenantId = tenantContext.getTenantId()
    const incoming = msgs.filter((m) => m.role !== 'system').length
    try {
      await withTenant(this.opts.sql, tenantId, async (tx) => {
        await ensureThread(tx, tenantId, ctx.threadId, extractAutoTitle(msgs) ?? undefined)
        const inserted = await saveMessages(tx, tenantId, ctx.threadId, msgs)

        await recordAudit(tx as unknown as Sql, {
          tenantId,
          actor: actorFromContext(),
          operation: 'memory.save_turn',
          resource: { type: 'thread', ids: [ctx.threadId] },
          result: 'ok',
          metadata: {
            incoming,
            persisted: inserted,
            skipped: incoming - inserted,
          },
        })

        logger.debug(
          {
            threadId: ctx.threadId,
            persisted: inserted,
            skipped: incoming - inserted,
          },
          'memory.save_turn',
        )
      })
    } catch (err) {
      throw new MemoryPersistFailedError(err)
    }
  }

  async getWorkingMemory(ctx: MemoryContext): Promise<string | null> {
    const tenantId = tenantContext.getTenantId()
    try {
      return await withTenant(this.opts.sql, tenantId, async (tx) => {
        if (ctx.scope === 'resource') {
          const userId = tenantContext.getUserId() ?? null
          if (!userId) return null
          const workingMemory = await readWorkingMemoryByResource(tx, tenantId, userId)
          await recordAudit(tx as unknown as Sql, {
            tenantId,
            actor: actorFromContext(),
            operation: 'memory.get_working_memory',
            resource: { type: 'resource', ids: [userId] },
            result: 'ok',
            metadata: { scope: 'resource', hit: workingMemory != null },
          })
          return workingMemory
        }

        const { workingMemory } = await readWorkingMemory(tx, tenantId, ctx.threadId)
        await recordAudit(tx as unknown as Sql, {
          tenantId,
          actor: actorFromContext(),
          operation: 'memory.get_working_memory',
          resource: { type: 'thread', ids: [ctx.threadId] },
          result: 'ok',
          metadata: { scope: 'thread', threadId: ctx.threadId, hit: workingMemory != null },
        })
        return workingMemory
      })
    } catch (err) {
      throw new MemoryPersistFailedError(err)
    }
  }

  async updateWorkingMemory(ctx: MemoryContext, text: string): Promise<void> {
    const tenantId = tenantContext.getTenantId()
    try {
      await withTenant(this.opts.sql, tenantId, async (tx) => {
        if (ctx.scope === 'resource') {
          const userId = tenantContext.getUserId() ?? null
          if (!userId) {
            await recordAudit(tx as unknown as Sql, {
              tenantId,
              actor: actorFromContext(),
              operation: 'memory.update_working_memory',
              result: 'failure',
              metadata: { scope: 'resource', reason: 'no_user_id' },
            })
            logger.warn(
              { threadId: ctx.threadId },
              'memory.update_working_memory.skipped: no_user_id',
            )
            return
          }
          await upsertWorkingMemoryByResource(tx, tenantId, userId, text)
          await recordAudit(tx as unknown as Sql, {
            tenantId,
            actor: actorFromContext(),
            operation: 'memory.update_working_memory',
            resource: { type: 'resource', ids: [userId] },
            result: 'ok',
            metadata: { scope: 'resource', bytes: Buffer.byteLength(text, 'utf8') },
          })
          logger.debug(
            { resourceId: userId, bytes: Buffer.byteLength(text, 'utf8') },
            'memory.update_working_memory',
          )
          return
        }

        const r = await upsertWorkingMemory(tx, tenantId, ctx.threadId, text)
        if (r.skipped) {
          await recordAudit(tx as unknown as Sql, {
            tenantId,
            actor: actorFromContext(),
            operation: 'memory.update_working_memory',
            resource: { type: 'thread', ids: [ctx.threadId] },
            result: 'failure',
            metadata: { scope: 'thread', reason: r.reason },
          })
          logger.warn(
            { threadId: ctx.threadId, reason: r.reason },
            'memory.update_working_memory.skipped',
          )
          return
        }

        await recordAudit(tx as unknown as Sql, {
          tenantId,
          actor: actorFromContext(),
          operation: 'memory.update_working_memory',
          resource: { type: 'thread', ids: [r.threadId] },
          result: 'ok',
          metadata: { scope: 'thread', bytes: Buffer.byteLength(text, 'utf8') },
        })
        logger.debug(
          { threadId: r.threadId, bytes: Buffer.byteLength(text, 'utf8') },
          'memory.update_working_memory',
        )
      })
    } catch (err) {
      // USER-class errors (cap exceeded) must reach the caller; only wrap SYSTEM failures.
      if (err instanceof WorkingMemoryTooLargeError) throw err
      throw new MemoryPersistFailedError(err)
    }
  }

  async getThread(threadId: string): Promise<Thread | null> {
    return this.getThreadById({ threadId })
  }

  async getThreadById(input: GetThreadInput): Promise<Thread | null> {
    const tenantId = tenantContext.getTenantId()
    try {
      return await withTenant(this.opts.sql, tenantId, (tx) => getThreadById(tx, tenantId, input))
    } catch (err) {
      throw new MemoryPersistFailedError(err)
    }
  }

  async listThreads(opts?: ListThreadsOptions): Promise<ListThreadsResult> {
    const tenantId = tenantContext.getTenantId()
    try {
      return await withTenant(this.opts.sql, tenantId, (tx) => listThreads(tx, tenantId, opts))
    } catch (err) {
      throw new MemoryPersistFailedError(err)
    }
  }

  async createThread(input: CreateThreadInput): Promise<Thread> {
    const tenantId = tenantContext.getTenantId()
    try {
      return await withTenant(this.opts.sql, tenantId, (tx) => createThread(tx, tenantId, input))
    } catch (err) {
      throw new MemoryPersistFailedError(err)
    }
  }

  async saveThread(input: SaveThreadInput | SaveThreadArgs): Promise<Thread> {
    const tenantId = tenantContext.getTenantId()
    try {
      return await withTenant(this.opts.sql, tenantId, (tx) => saveThread(tx, tenantId, input))
    } catch (err) {
      throw new MemoryPersistFailedError(err)
    }
  }

  async updateThread(input: UpdateThreadInput): Promise<Thread | null>
  async updateThread(threadId: string, patch: ThreadPatch): Promise<Thread | null>
  async updateThread(
    inputOrThreadId: UpdateThreadInput | string,
    patch?: ThreadPatch,
  ): Promise<Thread | null> {
    let input: UpdateThreadInput
    if (typeof inputOrThreadId === 'string') {
      if (!patch) {
        throw new MemoryPersistFailedError(new Error('updateThread patch is required'))
      }
      input = { id: inputOrThreadId, title: patch.title, metadata: patch.metadata }
    } else {
      input = inputOrThreadId
    }
    const tenantId = tenantContext.getTenantId()
    try {
      return await withTenant(this.opts.sql, tenantId, (tx) => updateThread(tx, tenantId, input))
    } catch (err) {
      throw new MemoryPersistFailedError(err)
    }
  }

  async deleteThread(input: DeleteThreadInput): Promise<void>
  async deleteThread(threadId: string): Promise<void>
  async deleteThread(input: DeleteThreadInput | string): Promise<void> {
    const tenantId = tenantContext.getTenantId()
    try {
      await withTenant(this.opts.sql, tenantId, (tx) => deleteThread(tx, tenantId, input))
    } catch (err) {
      throw new MemoryPersistFailedError(err)
    }
  }
}
