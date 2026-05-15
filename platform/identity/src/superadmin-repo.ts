import type { Sql } from 'postgres'

export async function isSuperadmin(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql<Array<{ ok: 1 }>>`
    SELECT 1 AS ok FROM auth.superadmins WHERE user_id = ${userId} LIMIT 1
  `
  return rows.length > 0
}
