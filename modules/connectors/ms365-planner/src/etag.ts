import { tenantContext } from '@seta/tenancy'

type DbSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

export function createEtagStore(sql: DbSql) {
  return {
    async get(taskId: string): Promise<string | null> {
      const tenantId = tenantContext.getTenantId()
      const rows = await sql`
        SELECT etag FROM connector_ms365_planner.planner_tasks_cache
        WHERE tenant_id = ${tenantId}
          AND graph_task_id = ${taskId}
          AND soft_deleted_at IS NULL
        LIMIT 1`
      return (rows[0] as { etag?: string } | undefined)?.etag ?? null
    },
  }
}
