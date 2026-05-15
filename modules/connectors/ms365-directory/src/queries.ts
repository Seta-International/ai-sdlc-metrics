type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

export async function queryDisplayNames(
  sql: Sql,
  tenantId: string,
  userIds: string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map()
  const rows = (await sql`
    SELECT entra_object_id, display_name
    FROM connector_ms365_directory.directory_users
    WHERE tenant_id = ${tenantId}
      AND entra_object_id = ANY(${userIds}::text[])
  `) as Array<{ entra_object_id: string; display_name: string }>
  return new Map(rows.map((r) => [r.entra_object_id, r.display_name]))
}

export async function queryDirectReports(
  sql: Sql,
  tenantId: string,
  managerId: string,
): Promise<string[]> {
  const rows = (await sql`
    SELECT entra_object_id
    FROM connector_ms365_directory.directory_users
    WHERE manager_id = ${managerId} AND tenant_id = ${tenantId}
  `) as Array<{ entra_object_id: string }>
  return rows.map((r) => r.entra_object_id)
}
