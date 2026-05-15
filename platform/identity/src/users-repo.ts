import type { Sql } from 'postgres'

export async function upsertUserByIdentity(
  sql: Sql,
  input: {
    provider: 'entra' | 'google'
    subject: string
    email: string
    name: string
    pictureUrl: string | null
  },
): Promise<{ id: string; email: string; name: string; pictureUrl: string | null }> {
  const linked = await sql<
    Array<{ id: string; email: string; name: string; picture_url: string | null }>
  >`
    SELECT u.id, u.email, u.name, u.picture_url
      FROM auth.user_identities i
      JOIN auth.users u ON u.id = i.user_id
     WHERE i.provider = ${input.provider} AND i.subject = ${input.subject}
     LIMIT 1
  `
  if (linked[0]) {
    return {
      id: linked[0].id,
      email: linked[0].email,
      name: linked[0].name,
      pictureUrl: linked[0].picture_url,
    }
  }

  const byEmail = await sql<
    Array<{ id: string; email: string; name: string; picture_url: string | null }>
  >`
    SELECT id, email, name, picture_url FROM auth.users WHERE email = ${input.email} LIMIT 1
  `
  if (byEmail[0]) {
    await sql`
      INSERT INTO auth.user_identities (provider, subject, user_id)
      VALUES (${input.provider}, ${input.subject}, ${byEmail[0].id})
    `
    return {
      id: byEmail[0].id,
      email: byEmail[0].email,
      name: byEmail[0].name,
      pictureUrl: byEmail[0].picture_url,
    }
  }

  const created = await sql<
    Array<{ id: string; email: string; name: string; picture_url: string | null }>
  >`
    INSERT INTO auth.users (email, name, picture_url, primary_provider)
    VALUES (${input.email}, ${input.name}, ${input.pictureUrl}, ${input.provider})
    RETURNING id, email, name, picture_url
  `
  const row = created[0]
  if (!row) throw new Error('auth.users insert returned no row')
  await sql`
    INSERT INTO auth.user_identities (provider, subject, user_id)
    VALUES (${input.provider}, ${input.subject}, ${row.id})
  `
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    pictureUrl: row.picture_url,
  }
}
