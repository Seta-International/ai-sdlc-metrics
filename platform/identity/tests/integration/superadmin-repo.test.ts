import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { isSuperadmin } from '../../src/superadmin-repo'

const url = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const sql = postgres(url, { onnotice: () => {} })

afterAll(async () => {
  await sql.end()
})

beforeEach(async () => {
  await sql`DELETE FROM auth.superadmins WHERE user_id IN (
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000a2'
  )`
})

describe('isSuperadmin', () => {
  it('returns true after insert', async () => {
    const userId = '00000000-0000-0000-0000-0000000000a1'
    await sql`INSERT INTO auth.users (id, email, name, primary_provider)
              VALUES (${userId}, 'a@x', 'A', 'entra')
              ON CONFLICT (id) DO NOTHING`
    await sql`INSERT INTO auth.superadmins (user_id) VALUES (${userId})
              ON CONFLICT (user_id) DO NOTHING`
    expect(await isSuperadmin(sql, userId)).toBe(true)
  })

  it('returns false when user is not in superadmins', async () => {
    const userId = '00000000-0000-0000-0000-0000000000a2'
    await sql`INSERT INTO auth.users (id, email, name, primary_provider)
              VALUES (${userId}, 'b@x', 'B', 'entra')
              ON CONFLICT (id) DO NOTHING`
    expect(await isSuperadmin(sql, userId)).toBe(false)
  })
})
