import { randomUUID } from 'node:crypto'
import { createPool, withTenant } from '@seta/db'
import { tenantContext } from '@seta/tenancy'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AgentMemoryProvider } from '../../src/provider'
import {
  closeTestSql,
  ensureMigrations,
  TEST_DATABASE_URL,
  testSql,
  truncateMemoryTables,
} from './_helpers'

const TENANT_A = '00000000-0000-0000-0000-0000000000aa'
const TENANT_B = '00000000-0000-0000-0000-0000000000bb'

// `tenant_user` has rolbypassrls = false — the only role that exercises RLS.
const TENANT_USER_URL = TEST_DATABASE_URL.replace(
  /(postgres:\/\/)[^:]+:[^@]+@/,
  '$1tenant_user:dev_only_change_me@',
)
const tenantUserSql = createPool(TENANT_USER_URL)

beforeAll(async () => {
  await ensureMigrations()
})

beforeEach(async () => {
  await truncateMemoryTables()
})

afterAll(async () => {
  await closeTestSql()
  await tenantUserSql.end({ timeout: 2 })
})

describe('RLS isolation (tenant_user role)', () => {
  it('tenant B cannot recall tenant A messages', async () => {
    const provider = new AgentMemoryProvider({ sql: tenantUserSql })
    const threadId = randomUUID()

    await tenantContext.run({ tenantId: TENANT_A, userId: 'alice' }, async () => {
      await provider.saveTurn({ threadId, scope: 'thread' }, [
        { id: randomUUID(), role: 'user', content: [{ type: 'text', text: 'secret' }] },
      ])
    })

    await tenantContext.run({ tenantId: TENANT_B, userId: 'bob' }, async () => {
      const res = await provider.recall({ threadId, scope: 'thread' })
      expect(res.messages).toEqual([])
    })
  })

  it('tenant B cannot read tenant A working memory through the provider', async () => {
    const provider = new AgentMemoryProvider({ sql: tenantUserSql })
    const threadId = randomUUID()

    await tenantContext.run({ tenantId: TENANT_A, userId: 'alice' }, async () => {
      await provider.saveTurn({ threadId, scope: 'thread' }, [
        { id: randomUUID(), role: 'user', content: [{ type: 'text', text: 'hi' }] },
      ])
      await provider.updateWorkingMemory({ threadId, scope: 'thread' }, 'tenant A only')
    })

    await tenantContext.run({ tenantId: TENANT_B, userId: 'alice' }, async () => {
      // Same threadId, but RLS hides the threads row, so resource_id resolves to null.
      const wm = await provider.getWorkingMemory({ threadId, scope: 'thread' })
      expect(wm).toBeNull()
    })
  })

  it('tenant B cannot UPDATE tenant A rows even with knowledge of the id', async () => {
    const provider = new AgentMemoryProvider({ sql: tenantUserSql })
    const threadId = randomUUID()

    await tenantContext.run({ tenantId: TENANT_A, userId: 'alice' }, async () => {
      await provider.saveTurn({ threadId, scope: 'thread' }, [
        { id: randomUUID(), role: 'user', content: [{ type: 'text', text: 'A row' }] },
      ])
    })

    // Manually try to update tenant A's thread as tenant B — RLS WITH CHECK should hide the row.
    await tenantContext.run({ tenantId: TENANT_B, userId: 'bob' }, async () => {
      await withTenant(tenantUserSql, TENANT_B, async (tx) => {
        const updated = await tx`
          UPDATE agent_memory.threads SET title = 'pwned' WHERE id = ${threadId} RETURNING id
        `
        expect(updated.length).toBe(0)
      })
    })

    // Verify the tenant A row is untouched — title remains the auto-derived
    // value from tenant A's saveTurn, NOT 'pwned'.
    const rows = await testSql()<Array<{ title: string | null }>>`
      SELECT title FROM agent_memory.threads WHERE id = ${threadId}
    `
    expect(rows[0]?.title).toBe('A row')
  })
})
