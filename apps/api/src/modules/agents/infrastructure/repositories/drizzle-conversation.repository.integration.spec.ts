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
import { DrizzleConversationRepository } from './drizzle-conversation.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000081'
const TENANT_B = '01900000-0000-7fff-8000-000000000082'
const USER_A = '01900000-0000-7fff-8000-000000000a81'
const USER_B = '01900000-0000-7fff-8000-000000000a82'

describe('DrizzleConversationRepository', () => {
  const db = createTestDb()
  let repo: DrizzleConversationRepository

  beforeAll(async () => {
    await migrateForTest()
    await db.execute(
      sql`TRUNCATE agents.agent_message, agents.agent_conversation RESTART IDENTITY CASCADE`,
    )
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'conv-repo-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'conv-repo-b' })
    repo = new DrizzleConversationRepository(db as never)
  })

  afterAll(async () => {
    await db.execute(
      sql`TRUNCATE agents.agent_message, agents.agent_conversation RESTART IDENTITY CASCADE`,
    )
    await truncateCoreSchema(db)
  })

  // ─── loadOrCreateActive ───────────────────────────────────────────────────

  it('loadOrCreateActive: creates a new conversation on first call', async () => {
    await setTenantContext(db, TENANT_A)

    const { conversation, isNew } = await repo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId: USER_A,
      surface: 'global-chat',
    })

    expect(isNew).toBe(true)
    expect(conversation.id).toBeTruthy()
    expect(conversation.tenantId).toBe(TENANT_A)
    expect(conversation.userId).toBe(USER_A)
    expect(conversation.surface).toBe('global-chat')
    expect(conversation.status).toBe('active')
    expect(conversation.summaryFailureStreak).toBe(0)
    expect(conversation.summaryDisabledAt).toBeNull()
    expect(conversation.archivedAt).toBeNull()
  })

  it('loadOrCreateActive: returns same conversation on second call (idempotent)', async () => {
    await setTenantContext(db, TENANT_A)

    const { conversation: first, isNew: firstIsNew } = await repo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId: USER_B,
      surface: 'global-chat',
    })
    expect(firstIsNew).toBe(true)

    const { conversation: second, isNew: secondIsNew } = await repo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId: USER_B,
      surface: 'global-chat',
    })
    expect(secondIsNew).toBe(false)
    expect(second.id).toBe(first.id)
  })

  it('loadOrCreateActive: different surface creates a separate conversation', async () => {
    await setTenantContext(db, TENANT_A)

    const userId = uuidv7()
    const { conversation: global } = await repo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId,
      surface: 'global-chat',
    })

    const { conversation: inline } = await repo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId,
      surface: 'inline:people:profile',
    })

    expect(global.id).not.toBe(inline.id)
  })

  it('cross-device consolidation: concurrent loadOrCreateActive with same scope returns same conversation_id', async () => {
    await setTenantContext(db, TENANT_A)
    const userId = uuidv7()

    // Simulate two concurrent calls — because we're using a single DB connection
    // and the unique constraint ensures idempotency, run both and expect same id.
    const [result1, result2] = await Promise.all([
      repo.loadOrCreateActive({ tenantId: TENANT_A, userId, surface: 'global-chat' }),
      repo.loadOrCreateActive({ tenantId: TENANT_A, userId, surface: 'global-chat' }),
    ])

    // Both must return the same conversation id due to unique constraint on (tenant, user, surface) WHERE active
    expect(result1.conversation.id).toBe(result2.conversation.id)
  })

  // ─── loadById ─────────────────────────────────────────────────────────────

  it('loadById: returns conversation for correct tenant', async () => {
    await setTenantContext(db, TENANT_A)
    const userId = uuidv7()

    const { conversation } = await repo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId,
      surface: 'global-chat',
    })

    const found = await repo.loadById({ id: conversation.id, tenantId: TENANT_A })
    expect(found).toBeDefined()
    expect(found?.id).toBe(conversation.id)
  })

  it('loadById: returns undefined for wrong tenant', async () => {
    await setTenantContext(db, TENANT_A)
    const userId = uuidv7()

    const { conversation } = await repo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId,
      surface: 'global-chat',
    })

    // Switch to TENANT_B — RLS should hide TENANT_A's conversation
    await setTenantContext(db, TENANT_B)
    const found = await repo.loadById({ id: conversation.id, tenantId: TENANT_B })
    expect(found).toBeUndefined()
  })

  // ─── archive ─────────────────────────────────────────────────────────────

  it('archive: sets status=archived and archived_at', async () => {
    await setTenantContext(db, TENANT_A)
    const userId = uuidv7()

    const { conversation } = await repo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId,
      surface: 'global-chat',
    })

    await repo.archive({ id: conversation.id, tenantId: TENANT_A })

    const archived = await repo.loadById({ id: conversation.id, tenantId: TENANT_A })
    expect(archived?.status).toBe('archived')
    expect(archived?.archivedAt).toBeInstanceOf(Date)
  })

  it('archive: archived conversation allows a new active one with the same scope', async () => {
    await setTenantContext(db, TENANT_A)
    const userId = uuidv7()

    const { conversation: first } = await repo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId,
      surface: 'global-chat',
    })

    await repo.archive({ id: first.id, tenantId: TENANT_A })

    const { conversation: second, isNew } = await repo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId,
      surface: 'global-chat',
    })

    expect(isNew).toBe(true)
    expect(second.id).not.toBe(first.id)
    expect(second.status).toBe('active')
  })

  // ─── listGlobal ──────────────────────────────────────────────────────────

  it('listGlobal: returns conversations in updated_at DESC order', async () => {
    await setTenantContext(db, TENANT_A)
    const userId = uuidv7()

    // Create conversations on unique surfaces
    const surface1 = `inline:test:list-global-${uuidv7()}`
    const surface2 = `inline:test:list-global-${uuidv7()}`

    const { conversation: conv1 } = await repo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId,
      surface: surface1,
    })

    const { conversation: conv2 } = await repo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId,
      surface: surface2,
    })

    // Pin conv1 to a timestamp clearly in the past and conv2 to now via raw SQL
    // so the DESC ordering is deterministic regardless of sub-millisecond timing.
    await db.execute(
      sql`UPDATE agents.agent_conversation SET updated_at = now() - interval '1 hour' WHERE id = ${conv1.id}`,
    )
    await db.execute(
      sql`UPDATE agents.agent_conversation SET updated_at = now() WHERE id = ${conv2.id}`,
    )

    const list = await repo.listGlobal({ tenantId: TENANT_A, userId, limit: 10 })

    const ids = list.map((c) => c.id)
    expect(ids).toContain(conv1.id)
    expect(ids).toContain(conv2.id)
    // conv2 is more recently updated → appears before conv1 in DESC order
    expect(ids.indexOf(conv2.id)).toBeLessThan(ids.indexOf(conv1.id))
  })

  // ─── listBySurface ────────────────────────────────────────────────────────

  it('listBySurface: returns only conversations for the given surface', async () => {
    await setTenantContext(db, TENANT_A)
    const userId = uuidv7()
    const uniqueSurface = `inline:hiring:req-${uuidv7()}`

    const { conversation: onSurface } = await repo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId,
      surface: uniqueSurface,
    })

    const { conversation: offSurface } = await repo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId,
      surface: `inline:people:profile-${uuidv7()}`,
    })

    const list = await repo.listBySurface({
      tenantId: TENANT_A,
      userId,
      surface: uniqueSurface,
    })

    const ids = list.map((c) => c.id)
    expect(ids).toContain(onSurface.id)
    expect(ids).not.toContain(offSurface.id)
  })

  // ─── incrementSummaryFailureStreak / setSummaryDisabled ──────────────────

  it('incrementSummaryFailureStreak: increments by 1 on each call', async () => {
    await setTenantContext(db, TENANT_A)
    const userId = uuidv7()

    const { conversation } = await repo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId,
      surface: `inline:streak-test:${uuidv7()}`,
    })

    const streak1 = await repo.incrementSummaryFailureStreak({
      id: conversation.id,
      tenantId: TENANT_A,
    })
    expect(streak1).toBe(1)

    const streak2 = await repo.incrementSummaryFailureStreak({
      id: conversation.id,
      tenantId: TENANT_A,
    })
    expect(streak2).toBe(2)

    const streak3 = await repo.incrementSummaryFailureStreak({
      id: conversation.id,
      tenantId: TENANT_A,
    })
    expect(streak3).toBe(3)
  })

  it('setSummaryDisabled: sets summary_disabled_at on the conversation', async () => {
    await setTenantContext(db, TENANT_A)
    const userId = uuidv7()

    const { conversation } = await repo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId,
      surface: `inline:disabled-test:${uuidv7()}`,
    })

    const disabledAt = new Date()
    await repo.setSummaryDisabled({ id: conversation.id, tenantId: TENANT_A, at: disabledAt })

    const updated = await repo.loadById({ id: conversation.id, tenantId: TENANT_A })
    expect(updated?.summaryDisabledAt).toBeInstanceOf(Date)
    expect(updated?.summaryDisabledAt!.getTime()).toBeCloseTo(disabledAt.getTime(), -2)
  })

  it('resetSummaryFailureStreak: resets streak to 0', async () => {
    await setTenantContext(db, TENANT_A)
    const userId = uuidv7()

    const { conversation } = await repo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId,
      surface: `inline:reset-test:${uuidv7()}`,
    })

    await repo.incrementSummaryFailureStreak({ id: conversation.id, tenantId: TENANT_A })
    await repo.incrementSummaryFailureStreak({ id: conversation.id, tenantId: TENANT_A })

    await repo.resetSummaryFailureStreak({ id: conversation.id, tenantId: TENANT_A })

    const updated = await repo.loadById({ id: conversation.id, tenantId: TENANT_A })
    expect(updated?.summaryFailureStreak).toBe(0)
  })

  // ─── Cross-tenant RLS ─────────────────────────────────────────────────────

  it('cross-tenant RLS: tenant A conversations not visible under tenant B context', async () => {
    const userId = uuidv7()

    // Create conversation as TENANT_A
    await setTenantContext(db, TENANT_A)
    const { conversation } = await repo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId,
      surface: `inline:rls-test:${uuidv7()}`,
    })

    // Switch to TENANT_B context
    await setTenantContext(db, TENANT_B)
    const list = await repo.listGlobal({ tenantId: TENANT_B, userId, limit: 50 })

    const ids = list.map((c) => c.id)
    expect(ids).not.toContain(conversation.id)
  })

  // ─── RLS enabled at table level ──────────────────────────────────────────

  it('has RLS enabled and forced at the table level', async () => {
    const rows = (await db.execute(sql`
      SELECT c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'agents' AND c.relname = 'agent_conversation'
    `)) as unknown as { rows: Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }> }

    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]!.relrowsecurity).toBe(true)
    expect(rows.rows[0]!.relforcerowsecurity).toBe(true)
  })
})
