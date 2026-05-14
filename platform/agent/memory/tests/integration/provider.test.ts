import { randomUUID } from 'node:crypto'
import type { KernelMessage, MemoryContext } from '@seta/agent-core'
import { tenantContext } from '@seta/tenant'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AgentMemoryProvider } from '../../src/provider'
import { ensureMigrations, testSql, truncateMemoryTables } from './_helpers'

const TENANT = '00000000-0000-0000-0000-000000000001'

function userMsg(text: string): KernelMessage {
  return { id: randomUUID(), role: 'user', content: [{ type: 'text', text }] }
}

function ctx(threadId: string): MemoryContext {
  return { threadId, scope: 'thread' }
}

function resourceCtx(threadId: string): MemoryContext {
  return { threadId, scope: 'resource' }
}

beforeAll(async () => {
  await ensureMigrations()
})

beforeEach(async () => {
  await truncateMemoryTables()
})

afterAll(async () => {
  await testSql().end({ timeout: 2 })
})

describe('AgentMemoryProvider', () => {
  it('saveTurn then recall round-trips', async () => {
    const provider = new AgentMemoryProvider({ sql: testSql() })
    const threadId = randomUUID()
    const m = userMsg('hi')

    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await provider.saveTurn(ctx(threadId), [m])
      const res = await provider.recall(ctx(threadId))
      expect(res.messages.map((x) => x.id)).toEqual([m.id])
      expect(res.total).toBe(1)
      expect(res.hasMore).toBe(false)
    })
  })

  it('writes audit rows for recall and saveTurn', async () => {
    const provider = new AgentMemoryProvider({ sql: testSql() })
    const threadId = randomUUID()

    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await provider.saveTurn(ctx(threadId), [userMsg('a')])
      await provider.recall(ctx(threadId))
    })

    const rows = await testSql()<Array<{ operation: string }>>`
      SELECT operation FROM audit.audit_log WHERE tenant_id = ${TENANT} ORDER BY ts
    `
    const ops = rows.map((r) => r.operation)
    expect(ops).toContain('memory.save_turn')
    expect(ops).toContain('memory.recall')
  })

  it('getWorkingMemory returns null for thread with no resource_id', async () => {
    const provider = new AgentMemoryProvider({ sql: testSql() })
    const threadId = randomUUID()

    await tenantContext.run({ tenantId: TENANT }, async () => {
      await provider.saveTurn(ctx(threadId), [userMsg('hi')])
      const wm = await provider.getWorkingMemory(ctx(threadId))
      expect(wm).toBeNull()
    })
  })

  it('updateWorkingMemory round-trips', async () => {
    const provider = new AgentMemoryProvider({ sql: testSql() })
    const threadId = randomUUID()

    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await provider.saveTurn(ctx(threadId), [userMsg('hi')])
      await provider.updateWorkingMemory(ctx(threadId), 'remember: cake')
      const wm = await provider.getWorkingMemory(ctx(threadId))
      expect(wm).toBe('remember: cake')
    })
  })

  it('updateWorkingMemory throws WORKING_MEMORY_TOO_LARGE at 8193 bytes', async () => {
    const provider = new AgentMemoryProvider({ sql: testSql() })
    const threadId = randomUUID()

    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await provider.saveTurn(ctx(threadId), [userMsg('hi')])
      await expect(
        provider.updateWorkingMemory(ctx(threadId), 'a'.repeat(8193)),
      ).rejects.toMatchObject({ code: 'WORKING_MEMORY_TOO_LARGE' })
    })
  })

  it('getWorkingMemory with scope resource reads by userId across threads', async () => {
    const provider = new AgentMemoryProvider({ sql: testSql() })
    const thread1 = randomUUID()
    const thread2 = randomUUID()

    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await provider.saveTurn(resourceCtx(thread1), [userMsg('hi')])
      await provider.updateWorkingMemory(resourceCtx(thread1), 'cross-thread fact')

      // new thread, same user — should still read the same working memory
      await provider.saveTurn(resourceCtx(thread2), [userMsg('hey')])
      const wm = await provider.getWorkingMemory(resourceCtx(thread2))
      expect(wm).toBe('cross-thread fact')
    })
  })

  it('getWorkingMemory with scope resource returns null when no userId', async () => {
    const provider = new AgentMemoryProvider({ sql: testSql() })
    const threadId = randomUUID()

    await tenantContext.run({ tenantId: TENANT }, async () => {
      await provider.saveTurn(resourceCtx(threadId), [userMsg('hi')])
      const wm = await provider.getWorkingMemory(resourceCtx(threadId))
      expect(wm).toBeNull()
    })
  })

  it('token-budget trims old messages on recall', async () => {
    const provider = new AgentMemoryProvider({ sql: testSql(), recallTokenBudget: 10 })
    const threadId = randomUUID()

    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      for (let i = 0; i < 5; i++) {
        await provider.saveTurn(ctx(threadId), [userMsg(`message ${i} with content`)])
      }
      const res = await provider.recall(ctx(threadId))
      expect(res.messages.length).toBeLessThan(5)
      const last = res.messages.at(-1)
      expect(last?.content[0]).toMatchObject({ text: expect.stringContaining('message 4') })
    })
  })
})
