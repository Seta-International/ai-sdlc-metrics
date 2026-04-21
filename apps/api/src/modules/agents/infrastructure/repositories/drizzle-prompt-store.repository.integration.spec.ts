import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
} from '@future/db/test-helpers'
import { DrizzlePromptStoreRepository } from './drizzle-prompt-store.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000061'
const TENANT_B = '01900000-0000-7fff-8000-000000000062'

describe('DrizzlePromptStoreRepository', () => {
  const db = createTestDb()
  let repo: DrizzlePromptStoreRepository

  beforeAll(async () => {
    await migrateForTest()
    await db.execute(sql`TRUNCATE agents.agent_prompt_store RESTART IDENTITY CASCADE`)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'prompt-store-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'prompt-store-b' })
    repo = new DrizzlePromptStoreRepository(db as never)
  })

  afterAll(async () => {
    await db.execute(sql`TRUNCATE agents.agent_prompt_store RESTART IDENTITY CASCADE`)
    await truncateCoreSchema(db)
  })

  it('inserts when hash is absent', async () => {
    await setTenantContext(db, TENANT_A)

    const result = await repo.putIfAbsent({
      contentHash: 'sha256-prompt-insert-001',
      layer: 'system',
      content: 'You are a helpful assistant.',
      tenantId: TENANT_A,
    })

    expect(result.inserted).toBe(true)
    expect(result.entry.content).toBe('You are a helpful assistant.')
    expect(result.entry.contentHash).toBe('sha256-prompt-insert-001')
    expect(result.entry.layer).toBe('system')
    expect(result.entry.tenantId).toBe(TENANT_A)
  })

  it('is idempotent on duplicate hash within the same tenant', async () => {
    await setTenantContext(db, TENANT_A)

    const first = await repo.putIfAbsent({
      contentHash: 'sha256-prompt-idem-002',
      layer: 'system',
      content: 'Original content.',
      tenantId: TENANT_A,
    })
    expect(first.inserted).toBe(true)

    const second = await repo.putIfAbsent({
      contentHash: 'sha256-prompt-idem-002',
      layer: 'system',
      content: 'Different content that should be ignored.',
      tenantId: TENANT_A,
    })

    expect(second.inserted).toBe(false)
    expect(second.entry.content).toBe('Original content.')
  })

  it('returns null from get() when hash is absent', async () => {
    await setTenantContext(db, TENANT_A)

    const found = await repo.get('sha256-prompt-missing-003', TENANT_A)
    expect(found).toBeNull()
  })

  it('returns the stored entry from get() when present', async () => {
    await setTenantContext(db, TENANT_A)

    await repo.putIfAbsent({
      contentHash: 'sha256-prompt-get-004',
      layer: 'developer',
      content: 'Developer prompt body.',
      tenantId: TENANT_A,
    })

    const found = await repo.get('sha256-prompt-get-004', TENANT_A)
    expect(found).not.toBeNull()
    expect(found?.content).toBe('Developer prompt body.')
    expect(found?.layer).toBe('developer')
    expect(found?.firstSeenAt).toBeInstanceOf(Date)
  })

  it('enforces cross-tenant isolation (structural RLS + app-level filter)', async () => {
    // Structural: RLS is enabled + forced on agents.agent_prompt_store.
    // Enforcement at runtime is bypassed for the superuser test role, so we verify the
    // configuration here and rely on the repository's app-level tenant filter below.
    const rls = await db.execute<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      sql`SELECT c.relrowsecurity, c.relforcerowsecurity
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'agents' AND c.relname = 'agent_prompt_store'`,
    )
    expect(rls.rows[0]?.relrowsecurity).toBe(true)
    expect(rls.rows[0]?.relforcerowsecurity).toBe(true)

    await setTenantContext(db, TENANT_B)
    const inserted = await repo.putIfAbsent({
      contentHash: 'sha256-prompt-rls-005',
      layer: 'system',
      content: 'Tenant B secret prompt.',
      tenantId: TENANT_B,
    })
    expect(inserted.inserted).toBe(true)

    // Application-level tenant filter: querying under tenant A returns null for a
    // tenant-B row, even without RLS enforcement.
    await setTenantContext(db, TENANT_A)
    const leaked = await repo.get('sha256-prompt-rls-005', TENANT_A)
    expect(leaked).toBeNull()
  })
})
