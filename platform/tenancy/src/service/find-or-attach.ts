import type { AttachStatus } from '@seta/identity'
import type { Sql } from 'postgres'

export type { AttachStatus }

export async function findOrAttachUser(sql: Sql, userId: string): Promise<AttachStatus> {
  const superRows = (await sql`
    SELECT 1 AS ok FROM auth.superadmins WHERE user_id = ${userId} LIMIT 1
  `) as Array<{ ok: number }>
  if (superRows.length > 0) return 'superadmin'

  const memberRows = (await sql`
    SELECT 1 AS ok FROM tenant.tenant_members WHERE user_id = ${userId} LIMIT 1
  `) as Array<{ ok: number }>
  if (memberRows.length > 0) return 'attached'

  return 'no-membership'
}
