import type { Sql } from 'postgres'
import { hashToken } from './magic-link'

export async function insertMagicLink(
  sql: Sql,
  input: {
    userId: string
    tenantId: string
    tokenHash: Buffer
    expiresAt: Date
    requestedIp: string | null
  },
): Promise<void> {
  await sql`
    INSERT INTO auth.magic_links (user_id, tenant_id, token_hash, expires_at, requested_ip)
    VALUES (${input.userId}, ${input.tenantId}, ${input.tokenHash}, ${input.expiresAt}, ${input.requestedIp})
  `
}

export async function consumeMagicLink(
  sql: Sql,
  rawToken: string,
): Promise<{ userId: string; tenantId: string } | null> {
  const h = hashToken(rawToken)
  const rows = (await sql`
    UPDATE auth.magic_links
       SET consumed_at = now()
     WHERE token_hash = ${h}
       AND consumed_at IS NULL
       AND expires_at  > now()
     RETURNING user_id, tenant_id
  `) as Array<{ user_id: string; tenant_id: string }>
  const r = rows[0]
  if (!r) return null
  return { userId: r.user_id, tenantId: r.tenant_id }
}

export async function countRecentRequestsForEmail(
  sql: Sql,
  email: string,
  windowMs: number,
): Promise<number> {
  const since = new Date(Date.now() - windowMs)
  const rows = (await sql`
    SELECT COUNT(*)::int AS n
    FROM auth.magic_links m
    JOIN auth.users u ON u.id = m.user_id
    WHERE u.email = lower(${email}) AND m.created_at > ${since}
  `) as Array<{ n: number }>
  return rows[0]?.n ?? 0
}
