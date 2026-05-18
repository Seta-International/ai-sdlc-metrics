import type { Sql } from 'postgres'

export type SeedInput = {
  sql: Sql
  tenant: { id: string; slug: string; name: string }
  superadminEmails: string[]
}

export async function runSeed({ sql, tenant, superadminEmails }: SeedInput): Promise<void> {
  await sql`
    INSERT INTO tenant.tenants (id, slug, display_name, status)
    VALUES (${tenant.id}, ${tenant.slug}, ${tenant.name}, 'active')
    ON CONFLICT (id) DO NOTHING
  `

  for (const email of superadminEmails) {
    const rows = (await sql`
      INSERT INTO auth.users (email, name, primary_provider)
      VALUES (${email}, ${email}, 'entra')
      ON CONFLICT (email) DO UPDATE SET email = excluded.email
      RETURNING id
    `) as Array<{ id: string }>
    const u = rows[0]
    if (!u) continue
    await sql`
      INSERT INTO auth.superadmins (user_id) VALUES (${u.id})
      ON CONFLICT (user_id) DO NOTHING
    `
  }
}
