import { randomUUID } from 'node:crypto'
import type { KernelMessage } from '@seta/agent-core'
import { withTenant } from '@seta/db'
import { tenantContext } from '@seta/tenancy'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fetchRecallPage } from '../../src/recall'
import { ensureThread, saveMessages } from '../../src/save-turn'
import { closeTestSql, ensureMigrations, testSql, truncateMemoryTables } from './_helpers'

const TENANT = '00000000-0000-0000-0000-000000000001'

function userMsg(text: string): KernelMessage {
  return { id: randomUUID(), role: 'user', content: [{ type: 'text', text }] }
}

beforeAll(async () => {
  await ensureMigrations()
})

beforeEach(async () => {
  await truncateMemoryTables()
})

afterAll(async () => {
  await closeTestSql()
})

describe('fetchRecallPage', () => {
  it('returns empty for unknown thread', async () => {
    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        const res = await fetchRecallPage(tx, randomUUID(), 40)
        expect(res.messages).toEqual([])
        expect(res.hasMore).toBe(false)
        expect(res.total).toBe(0)
      })
    })
  })

  it('returns messages in chronological order (across turns)', async () => {
    const threadId = randomUUID()
    const msgs = [userMsg('one'), userMsg('two'), userMsg('three')]

    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      // Separate withTenant calls = separate transactions = distinct now() values,
      // matching the real saveTurn-per-turn flow. Within one turn many messages
      // share now() and tie-break by id; that is intentional and Mastra-aligned.
      for (const m of msgs) {
        await withTenant(testSql(), TENANT, async (tx) => {
          await ensureThread(tx, TENANT, threadId)
          await saveMessages(tx, TENANT, threadId, [m])
        })
      }
      await withTenant(testSql(), TENANT, async (tx) => {
        const res = await fetchRecallPage(tx, threadId, 40)
        expect(res.messages.map((m) => m.id)).toEqual(msgs.map((m) => m.id))
        expect(res.total).toBe(3)
        expect(res.hasMore).toBe(false)
      })
    })
  })

  it('hasMore true when pageSize+1 rows exist', async () => {
    const threadId = randomUUID()
    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      for (let i = 0; i < 5; i++) {
        await withTenant(testSql(), TENANT, async (tx) => {
          await ensureThread(tx, TENANT, threadId)
          await saveMessages(tx, TENANT, threadId, [userMsg(`m${i}`)])
        })
      }
      await withTenant(testSql(), TENANT, async (tx) => {
        const res = await fetchRecallPage(tx, threadId, 3)
        expect(res.messages.length).toBe(3)
        expect(res.hasMore).toBe(true)
        expect(res.total).toBe(5)
      })
    })
  })

  it('never returns system messages (they are not persisted)', async () => {
    const threadId = randomUUID()
    const system: KernelMessage = {
      id: randomUUID(),
      role: 'system',
      content: [{ type: 'text', text: 'sys' }],
    }
    const user = userMsg('hi')

    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        await ensureThread(tx, TENANT, threadId)
        await saveMessages(tx, TENANT, threadId, [system, user])
      })
      await withTenant(testSql(), TENANT, async (tx) => {
        const res = await fetchRecallPage(tx, threadId, 40)
        expect(res.messages.map((m) => m.role)).toEqual(['user'])
      })
    })
  })

  it('preserves KernelMessage.id and toolCallId round-trip', async () => {
    const threadId = randomUUID()
    const toolCallId = 'call-1'
    const tool: KernelMessage = {
      id: randomUUID(),
      role: 'tool',
      toolCallId,
      content: [{ type: 'tool_result', toolCallId, result: { ok: true } }],
    }

    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        await ensureThread(tx, TENANT, threadId)
        await saveMessages(tx, TENANT, threadId, [tool])
      })
      await withTenant(testSql(), TENANT, async (tx) => {
        const res = await fetchRecallPage(tx, threadId, 40)
        expect(res.messages[0]?.id).toBe(tool.id)
        expect(res.messages[0]?.toolCallId).toBe(toolCallId)
      })
    })
  })
})
