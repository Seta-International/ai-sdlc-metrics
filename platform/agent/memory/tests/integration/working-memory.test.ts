import { randomUUID } from 'node:crypto'
import { withTenant } from '@seta/db'
import { tenantContext } from '@seta/tenancy'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { WorkingMemoryTooLargeError } from '../../src/errors'
import { ensureThread } from '../../src/save-turn'
import {
  readWorkingMemory,
  readWorkingMemoryByResource,
  upsertWorkingMemory,
  upsertWorkingMemoryByResource,
  WORKING_MEMORY_BYTE_CAP,
} from '../../src/working-memory'
import {
  closeTestSql,
  ensureMigrations,
  TEST_DATABASE_URL,
  testSql,
  truncateMemoryTables,
} from './_helpers'

const TENANT = '00000000-0000-0000-0000-000000000001'

beforeAll(async () => {
  await ensureMigrations()
})

beforeEach(async () => {
  await truncateMemoryTables()
})

afterAll(async () => {
  await closeTestSql()
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

  it('rejects 8193 bytes with WorkingMemoryTooLargeError', async () => {
    const threadId = randomUUID()
    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        await ensureThread(tx, TENANT, threadId)
        await expect(
          upsertWorkingMemory(tx, TENANT, threadId, 'a'.repeat(WORKING_MEMORY_BYTE_CAP + 1)),
        ).rejects.toBeInstanceOf(WorkingMemoryTooLargeError)
      })
    })
  })

  describe('resource-scoped (scope: resource)', () => {
    it('read on missing resource returns null', async () => {
      await tenantContext.run({ tenantId: TENANT, userId: 'bob' }, async () => {
        await withTenant(testSql(), TENANT, async (tx) => {
          const wm = await readWorkingMemoryByResource(tx, TENANT, 'bob')
          expect(wm).toBeNull()
        })
      })
    })

    it('write then read round-trips without a thread', async () => {
      await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
        await withTenant(testSql(), TENANT, async (tx) => {
          await upsertWorkingMemoryByResource(tx, TENANT, 'alice', 'remember: pasta')
          const wm = await readWorkingMemoryByResource(tx, TENANT, 'alice')
          expect(wm).toBe('remember: pasta')
        })
      })
    })

    it('resource memory survives across threads for the same user', async () => {
      const thread1 = randomUUID()
      const thread2 = randomUUID()

      await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
        await withTenant(testSql(), TENANT, async (tx) => {
          await ensureThread(tx, TENANT, thread1)
          await upsertWorkingMemoryByResource(tx, TENANT, 'alice', 'cross-thread note')
        })
        await withTenant(testSql(), TENANT, async (tx) => {
          await ensureThread(tx, TENANT, thread2)
          const wm = await readWorkingMemoryByResource(tx, TENANT, 'alice')
          expect(wm).toBe('cross-thread note')
        })
      })
    })

    it('rejects 8193 bytes with WorkingMemoryTooLargeError', async () => {
      await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
        await withTenant(testSql(), TENANT, async (tx) => {
          await expect(
            upsertWorkingMemoryByResource(
              tx,
              TENANT,
              'alice',
              'a'.repeat(WORKING_MEMORY_BYTE_CAP + 1),
            ),
          ).rejects.toBeInstanceOf(WorkingMemoryTooLargeError)
        })
      })
    })
  })

  it('CHECK constraint backstops the cap when bypassed', async () => {
    // Direct write as platform_admin (RLS bypass) — must still hit the CHECK.
    const admin = postgres(TEST_DATABASE_URL, { max: 1, prepare: false })
    try {
      await admin.unsafe('SET ROLE platform_admin')
      await expect(
        admin`
          INSERT INTO agent_memory.resources (id, tenant_id, working_memory)
          VALUES ('rogue', ${TENANT}, ${'b'.repeat(8193)})
        `,
      ).rejects.toThrow(/working_memory_8k|check constraint/i)
    } finally {
      await admin.end()
    }
  })
})
