import type { Sql } from 'postgres'
import type { TenantMembershipRole } from './index'

export type Member = {
  userId: string
  email: string
  name: string
  pictureUrl: string | null
  role: TenantMembershipRole
  source: string
  joinedAt: string
}

export async function listMembers(sql: Sql, tenantId: string): Promise<Member[]> {
  return (await sql`
    SELECT m.user_id        AS "userId",
           u.email,
           u.name,
           u.picture_url    AS "pictureUrl",
           m.role,
           m.source,
           m.created_at     AS "joinedAt"
    FROM tenant.tenant_members m
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.tenant_id = ${tenantId}
    ORDER BY u.name
  `) as Member[]
}

export async function setMemberRole(
  sql: Sql,
  tenantId: string,
  userId: string,
  role: TenantMembershipRole,
): Promise<{ userId: string; role: TenantMembershipRole }> {
  const rows = (await sql`
    UPDATE tenant.tenant_members
       SET role = ${role}
     WHERE tenant_id = ${tenantId} AND user_id = ${userId}
     RETURNING user_id AS "userId", role
  `) as Array<{ userId: string; role: TenantMembershipRole }>
  const row = rows[0]
  if (!row) throw new Error('member not found')
  return row
}

export async function removeMember(sql: Sql, tenantId: string, userId: string): Promise<void> {
  await sql`DELETE FROM tenant.tenant_members WHERE tenant_id = ${tenantId} AND user_id = ${userId}`
}
