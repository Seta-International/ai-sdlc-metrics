import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createSessionStore } from '../../src/session-store'

const url = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const sql = postgres(url, { onnotice: () => {} })
const store = createSessionStore(sql)

const userId = '00000000-0000-0000-0000-0000000099a1'
const otherUser = '00000000-0000-0000-0000-0000000099a2'

beforeEach(async () => {
  await sql`DELETE FROM auth.sessions WHERE user_id IN (${userId}, ${otherUser})`
  await sql`DELETE FROM auth.users WHERE id IN (${userId}, ${otherUser})`
  await sql`INSERT INTO auth.users (id, email, name, primary_provider) VALUES
    (${userId}, 'u99a1@x', 'U1', 'entra'),
    (${otherUser}, 'u99a2@x', 'U2', 'entra')`
})

afterAll(async () => {
  await sql`DELETE FROM auth.sessions WHERE user_id IN (${userId}, ${otherUser})`
  await sql`DELETE FROM auth.users WHERE id IN (${userId}, ${otherUser})`
  await sql.end()
})

describe('createSessionStore.deleteByUserId', () => {
  it('removes all sessions for the given user, preserves others', async () => {
    const s1 = crypto.randomUUID()
    const s2 = crypto.randomUUID()
    const sOther = crypto.randomUUID()
    const future = new Date(Date.now() + 86400000)
    await store.insert({ id: s1, userId, expiresAt: future, ip: null, userAgent: null })
    await store.insert({ id: s2, userId, expiresAt: future, ip: null, userAgent: null })
    await store.insert({
      id: sOther,
      userId: otherUser,
      expiresAt: future,
      ip: null,
      userAgent: null,
    })

    await store.deleteByUserId(userId)

    expect(await store.get(s1)).toBeNull()
    expect(await store.get(s2)).toBeNull()
    expect(await store.get(sOther)).not.toBeNull()
  })
})
