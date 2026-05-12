type DbSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

export function createEtagStore(sql: DbSql) {
  return {
    async get(taskId: string): Promise<string | null> {
      const rows = await sql`
        SELECT etag FROM connector_ms365_planner.planner_tasks_cache
        WHERE graph_task_id = ${taskId} LIMIT 1`
      return (rows[0] as { etag?: string } | undefined)?.etag ?? null
    },
  }
}
