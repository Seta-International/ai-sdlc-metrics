import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
} from '@future/db/test-helpers'
import { DrizzleNarrativeStoreRepository } from './drizzle-narrative-store.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000063'
const ROLE_ADMIN = '01900000-0000-7fff-8000-000000000201'

describe('DrizzleNarrativeStoreRepository', () => {
  const db = createTestDb()
  let repo: DrizzleNarrativeStoreRepository

  beforeAll(async () => {
    await migrateForTest()
    await db.execute(sql`TRUNCATE agents.agent_narrative_store RESTART IDENTITY CASCADE`)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'narrative-store-a' })
    repo = new DrizzleNarrativeStoreRepository(db as never)
  })

  afterAll(async () => {
    await db.execute(sql`TRUNCATE agents.agent_narrative_store RESTART IDENTITY CASCADE`)
    await truncateCoreSchema(db)
  })

  it('inserts narrative when hash is absent', async () => {
    await setTenantContext(db, TENANT_A)

    const result = await repo.putIfAbsent({
      contentHash: 'sha256-narrative-insert-001',
      tenantId: TENANT_A,
      roleId: ROLE_ADMIN,
      content: 'Admins oversee tenant configuration and security.',
    })

    expect(result.inserted).toBe(true)
    expect(result.entry.contentHash).toBe('sha256-narrative-insert-001')
    expect(result.entry.content).toBe('Admins oversee tenant configuration and security.')
    expect(result.entry.roleId).toBe(ROLE_ADMIN)
    expect(result.entry.tenantId).toBe(TENANT_A)
  })

  it('is idempotent on duplicate hash within the same tenant', async () => {
    await setTenantContext(db, TENANT_A)

    const first = await repo.putIfAbsent({
      contentHash: 'sha256-narrative-idem-002',
      tenantId: TENANT_A,
      roleId: ROLE_ADMIN,
      content: 'Original narrative content.',
    })
    expect(first.inserted).toBe(true)

    const second = await repo.putIfAbsent({
      contentHash: 'sha256-narrative-idem-002',
      tenantId: TENANT_A,
      roleId: ROLE_ADMIN,
      content: 'Different content that should be ignored.',
    })

    expect(second.inserted).toBe(false)
    expect(second.entry.content).toBe('Original narrative content.')
  })

  it('returns null from get() when hash is absent', async () => {
    await setTenantContext(db, TENANT_A)

    const found = await repo.get('sha256-narrative-missing-003', TENANT_A)
    expect(found).toBeNull()
  })

  it('returns the stored entry from get() when present', async () => {
    await setTenantContext(db, TENANT_A)

    await repo.putIfAbsent({
      contentHash: 'sha256-narrative-get-004',
      tenantId: TENANT_A,
      roleId: ROLE_ADMIN,
      content: 'Persisted narrative.',
    })

    const found = await repo.get('sha256-narrative-get-004', TENANT_A)
    expect(found).not.toBeNull()
    expect(found?.contentHash).toBe('sha256-narrative-get-004')
    expect(found?.content).toBe('Persisted narrative.')
    expect(found?.roleId).toBe(ROLE_ADMIN)
    expect(found?.tenantId).toBe(TENANT_A)
    expect(found?.firstSeenAt).toBeInstanceOf(Date)
  })

  it('has RLS enabled + forced at the table level (structural check)', async () => {
    const rows = (await db.execute(sql`
      SELECT c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'agents' AND c.relname = 'agent_narrative_store'
    `)) as unknown as { rows: Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }> }

    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]!.relrowsecurity).toBe(true)
    expect(rows.rows[0]!.relforcerowsecurity).toBe(true)
  })
})
