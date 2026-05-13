import { randomUUID } from 'node:crypto'
import { withTenant } from '@seta/db'
import { tenantContext } from '@seta/tenant'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ensureThread } from '../../src/save-turn'
import { readWorkingMemory, upsertWorkingMemory } from '../../src/working-memory'
import { ensureMigrations, testSql, truncateMemoryTables } from './_helpers'

const TENANT = '00000000-0000-0000-0000-000000000001'

beforeAll(async () => {
  await ensureMigrations()
})

beforeEach(async () => {
  await truncateMemoryTables()
})

afterAll(async () => {
  await testSql().end({ timeout: 2 })
})

describe('working memory', () => {
  it('read on missing thread returns null', async () => {
    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        const out = await readWorkingMemory(tx, TENANT, randomUUID())
        expect(out).toEqual({ resourceId: null, workingMemory: null })
      })
    })
  })

  it('write then read round-trips for the same resource', async () => {
    const threadId = randomUUID()
    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        await ensureThread(tx, TENANT, threadId)
        const r = await upsertWorkingMemory(tx, TENANT, threadId, 'remember: pizza')
        expect(r.skipped).toBe(false)
        const got = await readWorkingMemory(tx, TENANT, threadId)
        expect(got.resourceId).toBe('alice')
        expect(got.workingMemory).toBe('remember: pizza')
      })
    })
  })

  it('second write overwrites first', async () => {
    const threadId = randomUUID()
    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        await ensureThread(tx, TENANT, threadId)
        await upsertWorkingMemory(tx, TENANT, threadId, 'first')
        await upsertWorkingMemory(tx, TENANT, threadId, 'second')
        const got = await readWorkingMemory(tx, TENANT, threadId)
        expect(got.workingMemory).toBe('second')
      })
    })
  })

  it('returns skipped:true when thread has no resource_id', async () => {
    const threadId = randomUUID()
    await tenantContext.run({ tenantId: TENANT }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        await ensureThread(tx, TENANT, threadId)
        const r = await upsertWorkingMemory(tx, TENANT, threadId, 'anything')
        expect(r).toEqual({ skipped: true, reason: 'no_resource_id' })
      })
    })
  })
})
