import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  seedActor,
  setTenantContext,
} from '@future/db/test-helpers'
import type { Db } from '@future/db'
import { DrizzleNotificationRepository } from './drizzle-notification.repository'
import { sql } from 'drizzle-orm'

let db: Db
let repo: DrizzleNotificationRepository
let tenantId: string
let actorId: string

beforeAll(async () => {
  await migrateForTest()
  db = createTestDb()
  repo = new DrizzleNotificationRepository(db)
  const t = await seedTenant(db)
  tenantId = t.id
  const a = await seedActor(db, { tenantId })
  actorId = a.id
  await setTenantContext(db, tenantId)
})

afterAll(async () => {
  await db.execute(
    sql`TRUNCATE notifications.notification, notifications.notification_preference CASCADE`,
  )
})

describe('DrizzleNotificationRepository', () => {
  it('inserts a notification and retrieves it by recipient', async () => {
    const notif = await repo.insert({
      tenantId,
      recipientId: actorId,
      senderId: null,
      category: 'system',
      title: 'Test notification',
      body: 'Hello',
      resourceType: null,
      resourceId: null,
      resourceUrl: null,
    })

    expect(notif.id).toBeTruthy()
    expect(notif.readAt).toBeNull()

    const results = await repo.findByRecipient(tenantId, actorId, { limit: 10, offset: 0 })
    expect(results.some((n) => n.id === notif.id)).toBe(true)
  })

  it('countUnread returns correct count', async () => {
    const before = await repo.countUnread(tenantId, actorId)

    await repo.insert({
      tenantId,
      recipientId: actorId,
      senderId: null,
      category: 'approval',
      title: 'Leave approved',
      body: null,
      resourceType: 'leave_request',
      resourceId: null,
      resourceUrl: null,
    })

    const after = await repo.countUnread(tenantId, actorId)
    expect(after).toBe(before + 1)
  })

  it('markRead clears readAt on specified ids', async () => {
    const n = await repo.insert({
      tenantId,
      recipientId: actorId,
      senderId: null,
      category: 'system',
      title: 'To be read',
      body: null,
      resourceType: null,
      resourceId: null,
      resourceUrl: null,
    })

    await repo.markRead(tenantId, [n.id])

    const results = await repo.findByRecipient(tenantId, actorId, { limit: 50, offset: 0 })
    const updated = results.find((x) => x.id === n.id)
    expect(updated?.readAt).not.toBeNull()
  })

  it('upsertPreference stores and updates preference', async () => {
    const pref = await repo.upsertPreference({
      tenantId,
      actorId,
      category: 'approval',
      inApp: true,
      email: false,
    })
    expect(pref.email).toBe(false)

    const updated = await repo.upsertPreference({
      tenantId,
      actorId,
      category: 'approval',
      inApp: true,
      email: true,
    })
    expect(updated.email).toBe(true)
  })

  it('getPreferences returns all stored preferences for actor', async () => {
    await repo.upsertPreference({
      tenantId,
      actorId,
      category: 'mention',
      inApp: false,
      email: true,
    })
    const prefs = await repo.getPreferences(tenantId, actorId)
    expect(prefs.length).toBeGreaterThanOrEqual(2)
  })
})
