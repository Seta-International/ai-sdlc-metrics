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
import { DrizzlePromptStoreRepository } from './drizzle-prompt-store.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000061'
const TENANT_B = '01900000-0000-7fff-8000-000000000062'
const ACTOR = '01900000-0000-7fff-8000-0000000000a1'

describe('DrizzlePromptStoreRepository', () => {
  const db = createTestDb()
  const recordEvent = vi.fn().mockResolvedValue(undefined)
  const audit = { recordEvent, publishOutboxEvent: vi.fn() } as unknown as KernelAuditFacade
  let repo: DrizzlePromptStoreRepository

  beforeAll(async () => {
    await migrateForTest()
    await db.execute(sql`TRUNCATE agents.agent_prompt_store RESTART IDENTITY CASCADE`)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'prompt-store-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'prompt-store-b' })
    repo = new DrizzlePromptStoreRepository(db as never, audit)
  })

  afterAll(async () => {
    await db.execute(sql`TRUNCATE agents.agent_prompt_store RESTART IDENTITY CASCADE`)
    await truncateCoreSchema(db)
  })

  it('appends when hash is absent and emits agent.prompt_stored', async () => {
    await setTenantContext(db, TENANT_A)
    recordEvent.mockClear()

    const result = await repo.appendIfMissing({
      contentHash: 'sha256-prompt-insert-001',
      layer: 'system',
      content: 'You are a helpful assistant.',
      tenantId: TENANT_A,
      actorId: ACTOR,
    })

    expect(result.wasAppended).toBe(true)
    expect(result.entry.content).toBe('You are a helpful assistant.')
    expect(result.entry.contentHash).toBe('sha256-prompt-insert-001')
    expect(result.entry.layer).toBe('system')
    expect(result.entry.tenantId).toBe(TENANT_A)
    expect(recordEvent).toHaveBeenCalledTimes(1)
    expect(recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'agent.prompt_stored',
        module: 'agents',
        tenantId: TENANT_A,
        actorId: ACTOR,
        subjectId: 'sha256-prompt-insert-001',
        payload: expect.objectContaining({ layer: 'system' }),
      }),
    )
  })

  it('is idempotent on duplicate hash and does NOT re-emit audit event', async () => {
    await setTenantContext(db, TENANT_A)
    recordEvent.mockClear()

    const first = await repo.appendIfMissing({
      contentHash: 'sha256-prompt-idem-002',
      layer: 'router',
      content: 'Original content.',
      tenantId: TENANT_A,
      actorId: ACTOR,
    })
    expect(first.wasAppended).toBe(true)
    expect(recordEvent).toHaveBeenCalledTimes(1)

    recordEvent.mockClear()
    const second = await repo.appendIfMissing({
      contentHash: 'sha256-prompt-idem-002',
      layer: 'router',
      content: 'Different content that should be ignored.',
      tenantId: TENANT_A,
      actorId: ACTOR,
    })

    expect(second.wasAppended).toBe(false)
    expect(second.entry.content).toBe('Original content.')
    expect(recordEvent).not.toHaveBeenCalled()
  })

  it('accepts every layer value in the taxonomy', async () => {
    await setTenantContext(db, TENANT_A)
    const layers = ['system', 'router', 'sub_agent', 'tool_catalog', 'directive_schema'] as const
    for (const layer of layers) {
      const result = await repo.appendIfMissing({
        contentHash: `sha256-prompt-layer-${layer}`,
        layer,
        content: `Content for ${layer}.`,
        tenantId: TENANT_A,
        actorId: ACTOR,
      })
      expect(result.wasAppended).toBe(true)
      expect(result.entry.layer).toBe(layer)
    }
  })

  it('returns null from get() when hash is absent', async () => {
    await setTenantContext(db, TENANT_A)

    const found = await repo.get('sha256-prompt-missing-003', TENANT_A)
    expect(found).toBeNull()
  })

  it('returns the stored entry from get() when present', async () => {
    await setTenantContext(db, TENANT_A)

    await repo.appendIfMissing({
      contentHash: 'sha256-prompt-get-004',
      layer: 'sub_agent',
      content: 'Sub-agent prompt body.',
      tenantId: TENANT_A,
      actorId: ACTOR,
    })

    const found = await repo.get('sha256-prompt-get-004', TENANT_A)
    expect(found).not.toBeNull()
    expect(found?.content).toBe('Sub-agent prompt body.')
    expect(found?.layer).toBe('sub_agent')
    expect(found?.firstSeenAt).toBeInstanceOf(Date)
  })

  it('enforces cross-tenant isolation (structural RLS + app-level filter)', async () => {
    const rls = await db.execute<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      sql`SELECT c.relrowsecurity, c.relforcerowsecurity
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'agents' AND c.relname = 'agent_prompt_store'`,
    )
    expect(rls.rows[0]?.relrowsecurity).toBe(true)
    expect(rls.rows[0]?.relforcerowsecurity).toBe(true)

    await setTenantContext(db, TENANT_B)
    const appended = await repo.appendIfMissing({
      contentHash: 'sha256-prompt-rls-005',
      layer: 'system',
      content: 'Tenant B secret prompt.',
      tenantId: TENANT_B,
      actorId: ACTOR,
    })
    expect(appended.wasAppended).toBe(true)

    await setTenantContext(db, TENANT_A)
    const leaked = await repo.get('sha256-prompt-rls-005', TENANT_A)
    expect(leaked).toBeNull()
  })
})
