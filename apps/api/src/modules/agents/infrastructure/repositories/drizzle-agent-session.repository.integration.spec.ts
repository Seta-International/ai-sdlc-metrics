import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { uuidv7 } from 'uuidv7'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
} from '@future/db/test-helpers'
import { DrizzleAgentSessionRepository } from './drizzle-agent-session.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000071'
const TENANT_B = '01900000-0000-7fff-8000-000000000072'
const USER_A = '01900000-0000-7fff-8000-000000000a71'

describe('DrizzleAgentSessionRepository', () => {
  const db = createTestDb()
  let repo: DrizzleAgentSessionRepository

  beforeAll(async () => {
    await migrateForTest()
    await db.execute(sql`TRUNCATE agents.agent_session RESTART IDENTITY CASCADE`)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'agent-session-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'agent-session-b' })
    repo = new DrizzleAgentSessionRepository(db as never)
  })

  afterAll(async () => {
    await db.execute(sql`TRUNCATE agents.agent_session RESTART IDENTITY CASCADE`)
    await truncateCoreSchema(db)
  })

  it('create() persists all pinned-hash columns and returns the row', async () => {
    await setTenantContext(db, TENANT_A)
    const id = uuidv7()
    const conversationId = uuidv7()
    const pinned = { planner_tasks: 'sha256-sub-agent-a', planner_plans: 'sha256-sub-agent-b' }

    const entry = await repo.create({
      id,
      tenantId: TENANT_A,
      userId: USER_A,
      conversationId,
      routerPromptHash: 'sha256-router',
      permissionNarrativeHash: 'sha256-narrative',
      toolCatalogHash: 'sha256-catalog',
      directiveSchemaHash: 'sha256-directive',
      canonicalizerVersionHash: 'sha256-canon',
      pinnedSubAgentPromptHashes: pinned,
    })

    expect(entry.id).toBe(id)
    expect(entry.tenantId).toBe(TENANT_A)
    expect(entry.userId).toBe(USER_A)
    expect(entry.conversationId).toBe(conversationId)
    expect(entry.routerPromptHash).toBe('sha256-router')
    expect(entry.permissionNarrativeHash).toBe('sha256-narrative')
    expect(entry.toolCatalogHash).toBe('sha256-catalog')
    expect(entry.directiveSchemaHash).toBe('sha256-directive')
    expect(entry.canonicalizerVersionHash).toBe('sha256-canon')
    expect(entry.pinnedSubAgentPromptHashes).toEqual(pinned)
    expect(entry.startedAt).toBeInstanceOf(Date)
    expect(entry.endedAt).toBeNull()
  })

  it('findByConversation() returns null when no session exists', async () => {
    await setTenantContext(db, TENANT_A)

    const found = await repo.findByConversation({
      tenantId: TENANT_A,
      userId: USER_A,
      conversationId: uuidv7(),
    })

    expect(found).toBeNull()
  })

  it('findByConversation() returns the most-recent unended session, ignoring ended ones', async () => {
    await setTenantContext(db, TENANT_A)
    const conversationId = uuidv7()

    // Older session — will be ended.
    const older = await repo.create({
      id: uuidv7(),
      tenantId: TENANT_A,
      userId: USER_A,
      conversationId,
      routerPromptHash: 'sha256-router-older',
      permissionNarrativeHash: 'sha256-narr-older',
      toolCatalogHash: 'sha256-cat-older',
      directiveSchemaHash: 'sha256-dir-older',
      canonicalizerVersionHash: 'sha256-canon-older',
      pinnedSubAgentPromptHashes: {},
    })

    await repo.endSession(older.id)

    // Newer active session.
    const newer = await repo.create({
      id: uuidv7(),
      tenantId: TENANT_A,
      userId: USER_A,
      conversationId,
      routerPromptHash: 'sha256-router-newer',
      permissionNarrativeHash: 'sha256-narr-newer',
      toolCatalogHash: 'sha256-cat-newer',
      directiveSchemaHash: 'sha256-dir-newer',
      canonicalizerVersionHash: 'sha256-canon-newer',
      pinnedSubAgentPromptHashes: { x: 'y' },
    })

    const found = await repo.findByConversation({
      tenantId: TENANT_A,
      userId: USER_A,
      conversationId,
    })

    expect(found).not.toBeNull()
    expect(found?.id).toBe(newer.id)
    expect(found?.routerPromptHash).toBe('sha256-router-newer')
  })

  it('endSession() sets ended_at on the target session', async () => {
    await setTenantContext(db, TENANT_A)
    const conversationId = uuidv7()

    const entry = await repo.create({
      id: uuidv7(),
      tenantId: TENANT_A,
      userId: USER_A,
      conversationId,
      routerPromptHash: 'sha256-router-end',
      permissionNarrativeHash: 'sha256-narr-end',
      toolCatalogHash: 'sha256-cat-end',
      directiveSchemaHash: 'sha256-dir-end',
      canonicalizerVersionHash: 'sha256-canon-end',
      pinnedSubAgentPromptHashes: {},
    })

    await repo.endSession(entry.id)

    const rows = (await db.execute(sql`
      SELECT ended_at FROM agents.agent_session WHERE id = ${entry.id}
    `)) as unknown as { rows: Array<{ ended_at: Date | null }> }

    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]!.ended_at).not.toBeNull()

    // findByConversation no longer returns it.
    const stillActive = await repo.findByConversation({
      tenantId: TENANT_A,
      userId: USER_A,
      conversationId,
    })
    expect(stillActive).toBeNull()
  })

  it('has RLS enabled + forced at the table level', async () => {
    const rows = (await db.execute(sql`
      SELECT c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'agents' AND c.relname = 'agent_session'
    `)) as unknown as { rows: Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }> }

    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]!.relrowsecurity).toBe(true)
    expect(rows.rows[0]!.relforcerowsecurity).toBe(true)
  })

  it('partial unique index prevents a second active session for the same conversation', async () => {
    await setTenantContext(db, TENANT_A)
    const conversationId = uuidv7()

    await repo.create({
      id: uuidv7(),
      tenantId: TENANT_A,
      userId: USER_A,
      conversationId,
      routerPromptHash: 'sha256-router-uq',
      permissionNarrativeHash: 'sha256-narr-uq',
      toolCatalogHash: 'sha256-cat-uq',
      directiveSchemaHash: 'sha256-dir-uq',
      canonicalizerVersionHash: 'sha256-canon-uq',
      pinnedSubAgentPromptHashes: {},
    })

    // Attempting a second active session for the same (tenantId, conversationId)
    // must violate the partial unique constraint.
    await expect(
      repo.create({
        id: uuidv7(),
        tenantId: TENANT_A,
        userId: USER_A,
        conversationId,
        routerPromptHash: 'sha256-router-uq-2',
        permissionNarrativeHash: 'sha256-narr-uq-2',
        toolCatalogHash: 'sha256-cat-uq-2',
        directiveSchemaHash: 'sha256-dir-uq-2',
        canonicalizerVersionHash: 'sha256-canon-uq-2',
        pinnedSubAgentPromptHashes: {},
      }),
    ).rejects.toThrow()
  })

  it('partial unique index allows a new active session after the previous one is ended', async () => {
    await setTenantContext(db, TENANT_A)
    const conversationId = uuidv7()

    const first = await repo.create({
      id: uuidv7(),
      tenantId: TENANT_A,
      userId: USER_A,
      conversationId,
      routerPromptHash: 'sha256-router-restart-1',
      permissionNarrativeHash: 'sha256-narr-restart-1',
      toolCatalogHash: 'sha256-cat-restart-1',
      directiveSchemaHash: 'sha256-dir-restart-1',
      canonicalizerVersionHash: 'sha256-canon-restart-1',
      pinnedSubAgentPromptHashes: {},
    })

    await repo.endSession(first.id)

    // After ending the first session, a new active session must be accepted.
    const second = await repo.create({
      id: uuidv7(),
      tenantId: TENANT_A,
      userId: USER_A,
      conversationId,
      routerPromptHash: 'sha256-router-restart-2',
      permissionNarrativeHash: 'sha256-narr-restart-2',
      toolCatalogHash: 'sha256-cat-restart-2',
      directiveSchemaHash: 'sha256-dir-restart-2',
      canonicalizerVersionHash: 'sha256-canon-restart-2',
      pinnedSubAgentPromptHashes: {},
    })

    expect(second.endedAt).toBeNull()

    const found = await repo.findByConversation({
      tenantId: TENANT_A,
      userId: USER_A,
      conversationId,
    })
    expect(found?.id).toBe(second.id)
  })

  it('endSession() is idempotent — calling it on an already-ended session does not throw', async () => {
    await setTenantContext(db, TENANT_A)
    const conversationId = uuidv7()

    const entry = await repo.create({
      id: uuidv7(),
      tenantId: TENANT_A,
      userId: USER_A,
      conversationId,
      routerPromptHash: 'sha256-router-idem',
      permissionNarrativeHash: 'sha256-narr-idem',
      toolCatalogHash: 'sha256-cat-idem',
      directiveSchemaHash: 'sha256-dir-idem',
      canonicalizerVersionHash: 'sha256-canon-idem',
      pinnedSubAgentPromptHashes: {},
    })

    await repo.endSession(entry.id)
    // Second call on an already-ended session must not throw.
    await expect(repo.endSession(entry.id)).resolves.toBeUndefined()

    // Row is still invisible via findByConversation.
    const stillActive = await repo.findByConversation({
      tenantId: TENANT_A,
      userId: USER_A,
      conversationId,
    })
    expect(stillActive).toBeNull()
  })

  it('endSession() on a non-existent id does not throw', async () => {
    await setTenantContext(db, TENANT_A)
    await expect(repo.endSession(uuidv7())).resolves.toBeUndefined()
  })

  it('cross-tenant RLS: session seeded under TENANT_B is invisible to TENANT_A', async () => {
    const conversationId = uuidv7()

    // Seed a session as TENANT_B.
    await setTenantContext(db, TENANT_B)
    await repo.create({
      id: uuidv7(),
      tenantId: TENANT_B,
      userId: USER_A,
      conversationId,
      routerPromptHash: 'sha256-router-rls-b',
      permissionNarrativeHash: 'sha256-narr-rls-b',
      toolCatalogHash: 'sha256-cat-rls-b',
      directiveSchemaHash: 'sha256-dir-rls-b',
      canonicalizerVersionHash: 'sha256-canon-rls-b',
      pinnedSubAgentPromptHashes: {},
    })

    // Switch to TENANT_A context — same conversationId + userId — row must be hidden.
    await setTenantContext(db, TENANT_A)
    const leaked = await repo.findByConversation({
      tenantId: TENANT_A,
      userId: USER_A,
      conversationId,
    })
    expect(leaked).toBeNull()
  })

  it('cross-tenant RLS: session seeded under TENANT_A is invisible to TENANT_B', async () => {
    const conversationId = uuidv7()

    // Seed a session as TENANT_A.
    await setTenantContext(db, TENANT_A)
    await repo.create({
      id: uuidv7(),
      tenantId: TENANT_A,
      userId: USER_A,
      conversationId,
      routerPromptHash: 'sha256-router-rls-a',
      permissionNarrativeHash: 'sha256-narr-rls-a',
      toolCatalogHash: 'sha256-cat-rls-a',
      directiveSchemaHash: 'sha256-dir-rls-a',
      canonicalizerVersionHash: 'sha256-canon-rls-a',
      pinnedSubAgentPromptHashes: {},
    })

    // Switch to TENANT_B context — same conversationId + userId — row must be hidden.
    await setTenantContext(db, TENANT_B)
    const leaked = await repo.findByConversation({
      tenantId: TENANT_B,
      userId: USER_A,
      conversationId,
    })
    expect(leaked).toBeNull()
  })
})
