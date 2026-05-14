type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

export async function queryVisiblePlanIds(
  sql: Sql,
  tenantId: string,
  userId: string | undefined,
): Promise<string[]> {
  if (!userId) return []
  const rows = (await sql`
    SELECT DISTINCT plan_id
    FROM connector_ms365_planner.plan_members
    WHERE tenant_id = ${tenantId} AND user_id = ${userId}
  `) as Array<{ plan_id: string }>
  return rows.map((r) => r.plan_id)
}

export async function queryPlanTitle(
  sql: Sql,
  tenantId: string,
  planId: string,
): Promise<string | null> {
  const rows = (await sql`
    SELECT title FROM connector_ms365_planner.planner_plans_cache
    WHERE graph_plan_id = ${planId} AND tenant_id = ${tenantId} LIMIT 1
  `) as Array<{ title: string }>
  return rows[0]?.title ?? null
}

export async function queryPlanTitles(
  sql: Sql,
  tenantId: string,
  planIds: string[],
): Promise<Map<string, string>> {
  if (planIds.length === 0) return new Map()
  const rows = (await sql`
    SELECT graph_plan_id, title
    FROM connector_ms365_planner.planner_plans_cache
    WHERE tenant_id = ${tenantId} AND graph_plan_id = ANY(${planIds}::text[])
  `) as Array<{ graph_plan_id: string; title: string }>
  return new Map(rows.map((r) => [r.graph_plan_id, r.title]))
}

export async function queryTaskCountByStatus(
  sql: Sql,
  tenantId: string,
  planIds: string[],
): Promise<Array<{ percent_complete: number; count: number }>> {
  if (planIds.length === 0) return []
  return (await sql`
    SELECT percent_complete, COUNT(*)::int AS count
    FROM connector_ms365_planner.planner_tasks_cache
    WHERE tenant_id = ${tenantId}
      AND plan_id = ANY(${planIds}::text[])
      AND soft_deleted_at IS NULL
    GROUP BY percent_complete
    ORDER BY percent_complete
  `) as Array<{ percent_complete: number; count: number }>
}

export async function queryUnassignedTasks(
  sql: Sql,
  tenantId: string,
  planIds: string[],
  limit: number,
): Promise<Array<Record<string, unknown>>> {
  if (planIds.length === 0) return []
  return (await sql`
    SELECT graph_task_id, title, plan_id, due_date
    FROM connector_ms365_planner.planner_tasks_cache
    WHERE tenant_id = ${tenantId}
      AND plan_id = ANY(${planIds}::text[])
      AND percent_complete < 100
      AND (assignee_ids IS NULL OR array_length(assignee_ids, 1) IS NULL)
      AND soft_deleted_at IS NULL
    ORDER BY due_date NULLS LAST
    LIMIT ${limit}
  `) as Array<Record<string, unknown>>
}

export async function queryDueSoonTasks(
  sql: Sql,
  tenantId: string,
  planIds: string[],
  soonDate: Date,
  limit: number,
): Promise<Array<Record<string, unknown>>> {
  if (planIds.length === 0) return []
  return (await sql`
    SELECT graph_task_id, title, plan_id, due_date, assignee_ids, percent_complete
    FROM connector_ms365_planner.planner_tasks_cache
    WHERE tenant_id = ${tenantId}
      AND plan_id = ANY(${planIds}::text[])
      AND percent_complete < 100
      AND due_date <= ${soonDate}
      AND soft_deleted_at IS NULL
    ORDER BY due_date
    LIMIT ${limit}
  `) as Array<Record<string, unknown>>
}

export async function queryCompletionRate(
  sql: Sql,
  tenantId: string,
  planIds: string[],
  limit: number,
): Promise<Array<Record<string, unknown>>> {
  if (planIds.length === 0) return []
  return (await sql`
    SELECT
      plan_id,
      COUNT(*) FILTER (WHERE percent_complete = 100)::int AS completed,
      COUNT(*) FILTER (WHERE percent_complete < 100)::int AS open,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE percent_complete = 100)
              / NULLIF(COUNT(*), 0), 1
      ) AS rate_pct
    FROM connector_ms365_planner.planner_tasks_cache
    WHERE tenant_id = ${tenantId}
      AND plan_id = ANY(${planIds}::text[])
      AND soft_deleted_at IS NULL
    GROUP BY plan_id ORDER BY rate_pct DESC
    LIMIT ${limit}
  `) as Array<Record<string, unknown>>
}

export async function queryBlockedTasks(
  sql: Sql,
  tenantId: string,
  planIds: string[],
  staleThreshold: Date,
  limit: number,
): Promise<Array<Record<string, unknown>>> {
  if (planIds.length === 0) return []
  return (await sql`
    SELECT graph_task_id, title, plan_id, last_modified_at_graph, assignee_ids
    FROM connector_ms365_planner.planner_tasks_cache
    WHERE tenant_id = ${tenantId}
      AND plan_id = ANY(${planIds}::text[])
      AND percent_complete BETWEEN 1 AND 99
      AND last_modified_at_graph < ${staleThreshold}
      AND soft_deleted_at IS NULL
    ORDER BY last_modified_at_graph
    LIMIT ${limit}
  `) as Array<Record<string, unknown>>
}
