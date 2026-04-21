import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
} from '@future/db/test-helpers'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { DrizzleNarrativeStoreRepository } from './drizzle-narrative-store.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000063'
const ROLE_ADMIN = '01900000-0000-7fff-8000-000000000201'
const ACTOR = '01900000-0000-7fff-8000-0000000000a2'

describe('DrizzleNarrativeStoreRepository', () => {
  const db = createTestDb()
  const recordEvent = vi.fn().mockResolvedValue(undefined)
  const audit = { recordEvent, publishOutboxEvent: vi.fn() } as unknown as KernelAuditFacade
  let repo: DrizzleNarrativeStoreRepository

  beforeAll(async () => {
    await migrateForTest()
    await db.execute(sql`TRUNCATE agents.agent_narrative_store RESTART IDENTITY CASCADE`)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'narrative-store-a' })
    repo = new DrizzleNarrativeStoreRepository(db as never, audit)
  })

  afterAll(async () => {
    await db.execute(sql`TRUNCATE agents.agent_narrative_store RESTART IDENTITY CASCADE`)
    await truncateCoreSchema(db)
  })

  it('appends narrative when hash is absent and emits agent.narrative_stored', async () => {
    await setTenantContext(db, TENANT_A)
    recordEvent.mockClear()

    const result = await repo.appendIfMissing({
      contentHash: 'sha256-narrative-insert-001',
      tenantId: TENANT_A,
      roleId: ROLE_ADMIN,
      content: 'Admins oversee tenant configuration and security.',
      actorId: ACTOR,
    })

    expect(result.wasAppended).toBe(true)
    expect(result.entry.contentHash).toBe('sha256-narrative-insert-001')
    expect(result.entry.content).toBe('Admins oversee tenant configuration and security.')
    expect(result.entry.roleId).toBe(ROLE_ADMIN)
    expect(result.entry.tenantId).toBe(TENANT_A)
    expect(recordEvent).toHaveBeenCalledTimes(1)
    expect(recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'agent.narrative_stored',
        module: 'agents',
        tenantId: TENANT_A,
        actorId: ACTOR,
        subjectId: 'sha256-narrative-insert-001',
        payload: expect.objectContaining({ roleId: ROLE_ADMIN }),
      }),
    )
  })

  it('is idempotent on duplicate hash and does NOT re-emit audit event', async () => {
    await setTenantContext(db, TENANT_A)
    recordEvent.mockClear()

    const first = await repo.appendIfMissing({
      contentHash: 'sha256-narrative-idem-002',
      tenantId: TENANT_A,
      roleId: ROLE_ADMIN,
      content: 'Original narrative content.',
      actorId: ACTOR,
    })
    expect(first.wasAppended).toBe(true)
    expect(recordEvent).toHaveBeenCalledTimes(1)

    recordEvent.mockClear()
    const second = await repo.appendIfMissing({
      contentHash: 'sha256-narrative-idem-002',
      tenantId: TENANT_A,
      roleId: ROLE_ADMIN,
      content: 'Different content that should be ignored.',
      actorId: ACTOR,
    })

    expect(second.wasAppended).toBe(false)
    expect(second.entry.content).toBe('Original narrative content.')
    expect(recordEvent).not.toHaveBeenCalled()
  })

  it('returns null from get() when hash is absent', async () => {
    await setTenantContext(db, TENANT_A)

    const found = await repo.get('sha256-narrative-missing-003', TENANT_A)
    expect(found).toBeNull()
  })

  it('returns the stored entry from get() when present', async () => {
    await setTenantContext(db, TENANT_A)

    await repo.appendIfMissing({
      contentHash: 'sha256-narrative-get-004',
      tenantId: TENANT_A,
      roleId: ROLE_ADMIN,
      content: 'Persisted narrative.',
      actorId: ACTOR,
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
