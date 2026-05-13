import type { KernelMessage, MemoryContext, MemoryProvider, RecallResult } from '@seta/agent-core'
import { recordAudit } from '@seta/audit'
import { type DbSql, withTenant } from '@seta/db'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenant'
import type { Sql } from 'postgres'
import { actorFromContext } from './audit'
import { MemoryPersistFailedError, WorkingMemoryTooLargeError } from './errors'
import { fetchRecallPage, trimToTokenBudget } from './recall'
import { ensureThread, saveMessages } from './save-turn'
import { readWorkingMemory, upsertWorkingMemory } from './working-memory'

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
        await ensureThread(tx, tenantId, ctx.threadId)
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
        const { resourceId, workingMemory } = await readWorkingMemory(tx, tenantId, ctx.threadId)

        await recordAudit(tx as unknown as Sql, {
          tenantId,
          actor: actorFromContext(),
          operation: 'memory.get_working_memory',
          ...(resourceId ? { resource: { type: 'resource', ids: [resourceId] } } : {}),
          result: 'ok',
          metadata: { threadId: ctx.threadId, hit: workingMemory != null },
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
        const r = await upsertWorkingMemory(tx, tenantId, ctx.threadId, text)

        if (r.skipped) {
          await recordAudit(tx as unknown as Sql, {
            tenantId,
            actor: actorFromContext(),
            operation: 'memory.update_working_memory',
            resource: { type: 'thread', ids: [ctx.threadId] },
            result: 'failure',
            metadata: { reason: r.reason },
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
          resource: { type: 'resource', ids: [r.resourceId] },
          result: 'ok',
          metadata: { bytes: Buffer.byteLength(text, 'utf8') },
        })

        logger.debug(
          { resourceId: r.resourceId, bytes: Buffer.byteLength(text, 'utf8') },
          'memory.update_working_memory',
        )
      })
    } catch (err) {
      // USER-class errors (cap exceeded) must reach the caller; only wrap SYSTEM failures.
      if (err instanceof WorkingMemoryTooLargeError) throw err
      throw new MemoryPersistFailedError(err)
    }
  }
}
