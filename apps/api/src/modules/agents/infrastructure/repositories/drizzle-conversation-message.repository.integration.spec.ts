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
import { DrizzleConversationMessageRepository } from './drizzle-conversation-message.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000091'
const TENANT_B = '01900000-0000-7fff-8000-000000000092'
const USER_A = '01900000-0000-7fff-8000-000000000a91'

describe('DrizzleConversationMessageRepository', () => {
  const db = createTestDb()
  let convRepo: DrizzleConversationRepository
  let msgRepo: DrizzleConversationMessageRepository

  beforeAll(async () => {
    await migrateForTest()
    await db.execute(
      sql`TRUNCATE agents.agent_message, agents.agent_conversation RESTART IDENTITY CASCADE`,
    )
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'msg-repo-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'msg-repo-b' })
    convRepo = new DrizzleConversationRepository(db as never)
    msgRepo = new DrizzleConversationMessageRepository(db as never)
  })

  afterAll(async () => {
    await db.execute(
      sql`TRUNCATE agents.agent_message, agents.agent_conversation RESTART IDENTITY CASCADE`,
    )
    await truncateCoreSchema(db)
  })

  // ─── persist ──────────────────────────────────────────────────────────────

  it('persist: saves a message and returns it with id + createdAt', async () => {
    await setTenantContext(db, TENANT_A)

    const { conversation } = await convRepo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId: USER_A,
      surface: 'global-chat',
    })

    const message = await msgRepo.persist({
      conversationId: conversation.id,
      tenantId: TENANT_A,
      message: {
        conversationId: conversation.id,
        tenantId: TENANT_A,
        userId: USER_A,
        role: 'user',
        content: { text: 'Hello world' },
        summary: null,
        traceId: uuidv7(),
      },
    })

    expect(message.id).toBeTruthy()
    expect(message.conversationId).toBe(conversation.id)
    expect(message.tenantId).toBe(TENANT_A)
    expect(message.userId).toBe(USER_A)
    expect(message.role).toBe('user')
    expect(message.content).toEqual({ text: 'Hello world' })
    expect(message.summary).toBeNull()
    expect(message.createdAt).toBeInstanceOf(Date)
  })

  it('persist: saves assistant message with tool-result content', async () => {
    await setTenantContext(db, TENANT_A)

    const { conversation } = await convRepo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId: USER_A,
      surface: 'global-chat',
    })

    const traceId = uuidv7()
    const message = await msgRepo.persist({
      conversationId: conversation.id,
      tenantId: TENANT_A,
      message: {
        conversationId: conversation.id,
        tenantId: TENANT_A,
        userId: USER_A,
        role: 'assistant',
        content: {
          toolName: 'people.getEmployee',
          toolResult: { id: '123', name: 'Alice' },
        },
        summary: null,
        traceId,
      },
    })

    expect(message.id).toBeTruthy()
    expect(message.role).toBe('assistant')
    expect(message.content).toEqual({
      toolName: 'people.getEmployee',
      toolResult: { id: '123', name: 'Alice' },
    })
  })

  // ─── listForWindow ────────────────────────────────────────────────────────

  it('listForWindow: returns messages in created_at ASC order', async () => {
    await setTenantContext(db, TENANT_A)
    const userId = uuidv7()

    const { conversation } = await convRepo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId,
      surface: `inline:window-test:${uuidv7()}`,
    })

    const baseTime = new Date('2026-02-01T00:00:00Z')

    // Insert with explicit timestamps to guarantee ASC ordering
    const id1 = uuidv7()
    const id2 = uuidv7()
    const id3 = uuidv7()

    await db.execute(
      sql`INSERT INTO agents.agent_message (id, conversation_id, tenant_id, user_id, role, content, trace_id, created_at)
          VALUES (${id1}, ${conversation.id}, ${TENANT_A}, ${userId}, 'user', '{"text":"Message 1"}'::jsonb, ${uuidv7()}, ${new Date(baseTime.getTime() + 0).toISOString()})`,
    )
    await db.execute(
      sql`INSERT INTO agents.agent_message (id, conversation_id, tenant_id, user_id, role, content, trace_id, created_at)
          VALUES (${id2}, ${conversation.id}, ${TENANT_A}, ${userId}, 'assistant', '{"text":"Reply 1"}'::jsonb, ${uuidv7()}, ${new Date(baseTime.getTime() + 1000).toISOString()})`,
    )
    await db.execute(
      sql`INSERT INTO agents.agent_message (id, conversation_id, tenant_id, user_id, role, content, trace_id, created_at)
          VALUES (${id3}, ${conversation.id}, ${TENANT_A}, ${userId}, 'user', '{"text":"Message 2"}'::jsonb, ${uuidv7()}, ${new Date(baseTime.getTime() + 2000).toISOString()})`,
    )

    const window = await msgRepo.listForWindow({
      conversationId: conversation.id,
      tenantId: TENANT_A,
      limit: 10,
    })

    expect(window).toHaveLength(3)
    expect(window[0]!.id).toBe(id1)
    expect(window[1]!.id).toBe(id2)
    expect(window[2]!.id).toBe(id3)
  })

  it('listForWindow: keyset pagination with before cursor returns only older messages', async () => {
    await setTenantContext(db, TENANT_A)
    const userId = uuidv7()

    const { conversation } = await convRepo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId,
      surface: `inline:keyset-test:${uuidv7()}`,
    })

    // Insert 5 messages with deterministic, clearly-distinct timestamps via raw SQL
    // to avoid flakiness from sub-millisecond inserts sharing the same created_at.
    const baseTime = new Date('2026-01-01T00:00:00Z')
    const msgIds: string[] = []

    for (let i = 0; i < 5; i++) {
      const id = uuidv7()
      const traceId = uuidv7()
      const createdAt = new Date(baseTime.getTime() + i * 1000) // +1s each
      await db.execute(
        sql`INSERT INTO agents.agent_message (id, conversation_id, tenant_id, user_id, role, content, trace_id, created_at)
            VALUES (${id}, ${conversation.id}, ${TENANT_A}, ${userId}, 'user', ${JSON.stringify({ text: `Message ${i}` })}::jsonb, ${traceId}, ${createdAt.toISOString()})`,
      )
      msgIds.push(id)
    }

    // before = msgIds[3] should return msgIds[0], msgIds[1], msgIds[2]
    const page = await msgRepo.listForWindow({
      conversationId: conversation.id,
      tenantId: TENANT_A,
      limit: 10,
      before: msgIds[3]!,
    })

    expect(page).toHaveLength(3)
    expect(page[0]!.id).toBe(msgIds[0])
    expect(page[1]!.id).toBe(msgIds[1])
    expect(page[2]!.id).toBe(msgIds[2])
  })

  // ─── updateSummary ────────────────────────────────────────────────────────

  it('updateSummary: sets summary text on existing message', async () => {
    await setTenantContext(db, TENANT_A)
    const userId = uuidv7()

    const { conversation } = await convRepo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId,
      surface: `inline:summary-test:${uuidv7()}`,
    })

    const message = await msgRepo.persist({
      conversationId: conversation.id,
      tenantId: TENANT_A,
      message: {
        conversationId: conversation.id,
        tenantId: TENANT_A,
        userId,
        role: 'user',
        content: { text: 'What is my leave balance?' },
        summary: null,
        traceId: uuidv7(),
      },
    })

    expect(message.summary).toBeNull()

    await msgRepo.updateSummary({
      messageId: message.id,
      tenantId: TENANT_A,
      summary: 'User asked about leave balance.',
    })

    const [updated] = await msgRepo.listForWindow({
      conversationId: conversation.id,
      tenantId: TENANT_A,
      limit: 1,
    })

    expect(updated!.summary).toBe('User asked about leave balance.')
  })

  // ─── hardDeleteContent ────────────────────────────────────────────────────

  it('hardDeleteContent: nulls content + summary, retains row shells (id, trace_id, created_at, conversation_id)', async () => {
    await setTenantContext(db, TENANT_A)
    const userId = uuidv7()

    const { conversation } = await convRepo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId,
      surface: `inline:gdpr-test:${uuidv7()}`,
    })

    const traceId = uuidv7()
    const message = await msgRepo.persist({
      conversationId: conversation.id,
      tenantId: TENANT_A,
      message: {
        conversationId: conversation.id,
        tenantId: TENANT_A,
        userId,
        role: 'user',
        content: { text: 'This is PII that must be erased.' },
        summary: 'PII summary',
        traceId,
      },
    })

    // Update the summary first so we can verify it gets NULLed too
    await msgRepo.updateSummary({
      messageId: message.id,
      tenantId: TENANT_A,
      summary: 'User has PII summary.',
    })

    const result = await msgRepo.hardDeleteContent({ userId, tenantId: TENANT_A })
    expect(result.count).toBeGreaterThanOrEqual(1)

    // Verify the row still exists (shell retained) but content + summary are NULL
    const rows = (await db.execute(
      sql`SELECT id, conversation_id, trace_id, created_at, content, summary
          FROM agents.agent_message
          WHERE id = ${message.id}`,
    )) as unknown as {
      rows: Array<{
        id: string
        conversation_id: string
        trace_id: string
        created_at: Date
        content: unknown
        summary: unknown
      }>
    }

    expect(rows.rows).toHaveLength(1)
    const row = rows.rows[0]!
    expect(row.id).toBe(message.id)
    expect(row.conversation_id).toBe(conversation.id)
    expect(row.trace_id).toBe(traceId)
    expect(row.created_at).toBeTruthy()
    expect(row.content).toBeNull()
    expect(row.summary).toBeNull()
  })

  // ─── FTS search ───────────────────────────────────────────────────────────

  it('FTS search: returns user-utterance match', async () => {
    await setTenantContext(db, TENANT_A)
    const userId = uuidv7()

    const { conversation } = await convRepo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId,
      surface: `inline:fts-test:${uuidv7()}`,
    })

    await msgRepo.persist({
      conversationId: conversation.id,
      tenantId: TENANT_A,
      message: {
        conversationId: conversation.id,
        tenantId: TENANT_A,
        userId,
        role: 'user',
        content: { text: 'What is my vacation allowance for this year?' },
        summary: null,
        traceId: uuidv7(),
      },
    })

    const results = await msgRepo.search({
      tenantId: TENANT_A,
      userId,
      query: 'vacation allowance',
      limit: 10,
    })

    expect(results.length).toBeGreaterThanOrEqual(1)
    const found = results.find((r) => r.userId === userId)
    expect(found).toBeDefined()
  })

  it('FTS search: does NOT return tool-result content (R-04.8)', async () => {
    await setTenantContext(db, TENANT_A)
    const userId = uuidv7()
    // Use a unique phrase guaranteed to appear ONLY in tool-result content
    const uniqueToolPhrase = `supersecret-tool-xyz-${uuidv7().replace(/-/g, '')}`

    const { conversation } = await convRepo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId,
      surface: `inline:fts-toolresult-test:${uuidv7()}`,
    })

    // Persist an assistant message whose content is a tool result (not a user utterance)
    await msgRepo.persist({
      conversationId: conversation.id,
      tenantId: TENANT_A,
      message: {
        conversationId: conversation.id,
        tenantId: TENANT_A,
        userId,
        role: 'assistant',
        content: {
          toolName: 'people.getLeaveBalance',
          toolResult: { result: uniqueToolPhrase },
        },
        summary: null,
        traceId: uuidv7(),
      },
    })

    // FTS search must NOT find the tool-result phrase
    const results = await msgRepo.search({
      tenantId: TENANT_A,
      userId,
      query: uniqueToolPhrase.split('-').slice(0, 3).join(' '),
      limit: 10,
    })

    // None of the results should have content containing the unique phrase
    for (const r of results) {
      const contentStr = JSON.stringify(r.content)
      expect(contentStr).not.toContain(uniqueToolPhrase)
    }
  })

  // ─── Cross-tenant RLS ─────────────────────────────────────────────────────

  it('cross-tenant RLS: tenant A messages not visible under tenant B context', async () => {
    const userId = uuidv7()

    // Seed message as TENANT_A
    await setTenantContext(db, TENANT_A)
    const { conversation: convA } = await convRepo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId,
      surface: `inline:rls-msg-test:${uuidv7()}`,
    })
    await msgRepo.persist({
      conversationId: convA.id,
      tenantId: TENANT_A,
      message: {
        conversationId: convA.id,
        tenantId: TENANT_A,
        userId,
        role: 'user',
        content: { text: 'Tenant A secret message' },
        summary: null,
        traceId: uuidv7(),
      },
    })

    // Switch to TENANT_B — messages for TENANT_A's conversation must not leak
    await setTenantContext(db, TENANT_B)
    const results = await msgRepo.listForWindow({
      conversationId: convA.id,
      tenantId: TENANT_B,
      limit: 50,
    })

    expect(results).toHaveLength(0)
  })

  it('has RLS enabled and forced at the agent_message table level', async () => {
    const rows = (await db.execute(sql`
      SELECT c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'agents' AND c.relname = 'agent_message'
    `)) as unknown as { rows: Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }> }

    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]!.relrowsecurity).toBe(true)
    expect(rows.rows[0]!.relforcerowsecurity).toBe(true)
  })

  // ─── persistMany ──────────────────────────────────────────────────────────

  it('persistMany: saves multiple messages and returns them all with ids + createdAt', async () => {
    await setTenantContext(db, TENANT_A)
    const userId = uuidv7()

    const { conversation } = await convRepo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId,
      surface: `inline:persist-many-test:${uuidv7()}`,
    })

    const traceId1 = uuidv7()
    const traceId2 = uuidv7()

    const messages = await msgRepo.persistMany({
      conversationId: conversation.id,
      tenantId: TENANT_A,
      messages: [
        {
          conversationId: conversation.id,
          tenantId: TENANT_A,
          userId,
          role: 'user',
          content: { text: 'First message' },
          summary: null,
          traceId: traceId1,
        },
        {
          conversationId: conversation.id,
          tenantId: TENANT_A,
          userId,
          role: 'assistant',
          content: { text: 'First reply' },
          summary: null,
          traceId: traceId2,
        },
      ],
    })

    expect(messages).toHaveLength(2)
    expect(messages[0]!.id).toBeTruthy()
    expect(messages[1]!.id).toBeTruthy()
    expect(messages[0]!.role).toBe('user')
    expect(messages[1]!.role).toBe('assistant')
    expect(messages[0]!.createdAt).toBeInstanceOf(Date)
  })

  it('FTS search: returns match on summary text', async () => {
    await setTenantContext(db, TENANT_A)
    const userId = uuidv7()

    const { conversation } = await convRepo.loadOrCreateActive({
      tenantId: TENANT_A,
      userId,
      surface: `inline:fts-summary-test:${uuidv7()}`,
    })

    const message = await msgRepo.persist({
      conversationId: conversation.id,
      tenantId: TENANT_A,
      message: {
        conversationId: conversation.id,
        tenantId: TENANT_A,
        userId,
        role: 'user',
        content: { text: 'What is my overtime balance?' },
        summary: null,
        traceId: uuidv7(),
      },
    })

    // Set a summary for the message
    await msgRepo.updateSummary({
      messageId: message.id,
      tenantId: TENANT_A,
      summary: 'User asked about their overtime compensation balance.',
    })

    const results = await msgRepo.search({
      tenantId: TENANT_A,
      userId,
      query: 'overtime compensation',
      limit: 10,
    })

    expect(results.length).toBeGreaterThanOrEqual(1)
    const found = results.find((r) => r.id === message.id)
    expect(found).toBeDefined()
  })
})
