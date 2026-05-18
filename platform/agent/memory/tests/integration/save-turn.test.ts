import { randomUUID } from 'node:crypto'
import type { KernelMessage } from '@seta/agent-core'
import { withTenant } from '@seta/db'
import { tenantContext } from '@seta/tenancy'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ensureThread, saveMessages } from '../../src/save-turn'
import { closeTestSql, ensureMigrations, testSql, truncateMemoryTables } from './_helpers'

const TENANT = '00000000-0000-0000-0000-000000000001'

function userMsg(text: string, id?: string): KernelMessage {
  return { ...(id ? { id } : {}), role: 'user', content: [{ type: 'text', text }] }
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

describe('ensureThread', () => {
  it('sets title on first insert when autoTitle is provided', async () => {
    const threadId = randomUUID()
    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        await ensureThread(tx, TENANT, threadId, 'Hello from user')
      })
    })
    const rows = await testSql()`SELECT title FROM agent_memory.threads WHERE id = ${threadId}`
    expect(rows[0]?.title).toBe('Hello from user')
  })

  it('does not overwrite an existing title on subsequent ensureThread calls', async () => {
    const threadId = randomUUID()
    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        await ensureThread(tx, TENANT, threadId, 'First title')
        await ensureThread(tx, TENANT, threadId, 'Second title')
      })
    })
    const rows = await testSql()`SELECT title FROM agent_memory.threads WHERE id = ${threadId}`
    expect(rows[0]?.title).toBe('First title')
  })

  it('creates a thread row stamped with the current user id', async () => {
    const threadId = randomUUID()
    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        const r = await ensureThread(tx, TENANT, threadId)
        expect(r.resourceId).toBe('alice')
      })
    })
    const rows = await testSql()`SELECT * FROM agent_memory.threads WHERE id = ${threadId}`
    expect(rows.length).toBe(1)
    expect(rows[0]?.resource_id).toBe('alice')
  })

  it('is idempotent on second call with same id', async () => {
    const threadId = randomUUID()
    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        await ensureThread(tx, TENANT, threadId)
        await ensureThread(tx, TENANT, threadId)
      })
    })
    const rows =
      await testSql()`SELECT count(*)::int as n FROM agent_memory.threads WHERE id = ${threadId}`
    expect(rows[0]?.n).toBe(1)
  })

  it('preserves the original resource_id even if userId changes later', async () => {
    const threadId = randomUUID()
    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        await ensureThread(tx, TENANT, threadId)
      })
    })
    await tenantContext.run({ tenantId: TENANT, userId: 'bob' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        const r = await ensureThread(tx, TENANT, threadId)
        expect(r.resourceId).toBe('alice')
      })
    })
  })
})

describe('saveMessages', () => {
  it('inserts new rows and is idempotent on replay', async () => {
    const threadId = randomUUID()
    const m1 = userMsg('hi', randomUUID())
    const m2 = userMsg('again', randomUUID())

    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        await ensureThread(tx, TENANT, threadId)
        const inserted1 = await saveMessages(tx, TENANT, threadId, [m1, m2])
        expect(inserted1).toBe(2)
        const inserted2 = await saveMessages(tx, TENANT, threadId, [m1, m2])
        expect(inserted2).toBe(0)
      })
    })

    const rows = await testSql()`SELECT id FROM agent_memory.messages WHERE thread_id = ${threadId}`
    expect(rows.length).toBe(2)
  })

  it('skips role==="system" messages', async () => {
    const threadId = randomUUID()
    const system: KernelMessage = {
      id: randomUUID(),
      role: 'system',
      content: [{ type: 'text', text: 'you are helpful' }],
    }
    const user = userMsg('hi', randomUUID())

    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        await ensureThread(tx, TENANT, threadId)
        const inserted = await saveMessages(tx, TENANT, threadId, [system, user])
        expect(inserted).toBe(1)
      })
    })

    const rows =
      await testSql()`SELECT role FROM agent_memory.messages WHERE thread_id = ${threadId}`
    expect(rows.map((r) => r.role)).toEqual(['user'])
  })

  it('stamps a random id on id-less user messages', async () => {
    const threadId = randomUUID()
    const m = userMsg('hi') // no id

    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        await ensureThread(tx, TENANT, threadId)
        await saveMessages(tx, TENANT, threadId, [m])
      })
    })

    const rows = await testSql()`SELECT id FROM agent_memory.messages WHERE thread_id = ${threadId}`
    expect(rows.length).toBe(1)
    expect(rows[0]?.id).toMatch(/^[0-9a-f-]{36}$/i)
  })

  it('increments thread.message_count by the number of inserted rows', async () => {
    const threadId = randomUUID()
    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        await ensureThread(tx, TENANT, threadId)
        await saveMessages(tx, TENANT, threadId, [userMsg('a', randomUUID())])
        await saveMessages(tx, TENANT, threadId, [
          userMsg('b', randomUUID()),
          userMsg('c', randomUUID()),
        ])
      })
    })
    const rows =
      await testSql()`SELECT message_count FROM agent_memory.threads WHERE id = ${threadId}`
    expect(rows[0]?.message_count).toBe(3)
  })

  it('stamps resource_id from thread onto inserted messages', async () => {
    const threadId = randomUUID()
    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        await ensureThread(tx, TENANT, threadId)
        await saveMessages(tx, TENANT, threadId, [userMsg('hi', randomUUID())])
      })
    })
    const rows =
      await testSql()`SELECT resource_id FROM agent_memory.messages WHERE thread_id = ${threadId}`
    expect(rows[0]?.resource_id).toBe('alice')
  })
})
