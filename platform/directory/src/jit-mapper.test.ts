import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'
import { createJitMapper } from './jit-mapper'

const URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'

describe('JIT mapper', () => {
  const sql = postgres(URL, { max: 1, prepare: false })
  const mapper = createJitMapper(sql)

  afterAll(() => sql.end())

  it('upserts then idempotently updates on second sighting', async () => {
    const tenantId = '66666666-6666-6666-6666-666666666666'
    const subject = 'entra-subject-1'
    await sql`INSERT INTO tenant.tenants (id, slug) VALUES (${tenantId}, ${`t-${tenantId.slice(0, 8)}`}) ON CONFLICT DO NOTHING`
    // Clean up any prior runs of these tests so we start from a known state
    await sql`DELETE FROM directory.external_identities WHERE provider_id = 'entra' AND external_subject = ${subject}`
    await sql`DELETE FROM auth.users WHERE external_provider = 'entra' AND external_subject = ${subject}`

    const user1 = await mapper.upsertFromIdToken({
      tenantId,
      providerId: 'entra',
      externalSubject: subject,
      email: 'alice@example.com',
      displayName: 'Alice',
      rawProfile: { upn: 'alice@example.com' },
    })
    expect(user1.email).toBe('alice@example.com')

    const ext = await sql<
      Array<{ user_id: string }>
    >`SELECT user_id FROM directory.external_identities WHERE provider_id = 'entra' AND external_subject = ${subject}`
    expect(ext).toHaveLength(1)
    expect(ext[0]?.user_id).toBe(user1.id)

    const user2 = await mapper.upsertFromIdToken({
      tenantId,
      providerId: 'entra',
      externalSubject: subject,
      email: 'alice+new@example.com',
      displayName: 'Alice (renamed)',
      rawProfile: {},
    })
    expect(user2.id).toBe(user1.id)
    expect(user2.email).toBe('alice+new@example.com')
  })
})
