import type { Tool } from '@seta/agent-core'
import { queryAnalyticsTool } from './tools/query_analytics'
import { tasksByPlanTool } from './tools/tasks_by_plan'
import { tasksByStatusTool } from './tools/tasks_by_status'
import type { AnalyticsToolDeps } from './tools/workload_by_assignee'
import { workloadByAssigneeTool } from './tools/workload_by_assignee'

export type { ChartSeries, ChartYBarData } from './cards/chart-ybar'
export { chartYBarCard } from './cards/chart-ybar'
export { analyticsSchema } from './schema'
export { ANALYTICS_PROFILE_SEED, ANALYTICS_SLUG, ANALYTICS_TOOL_IDS } from './seeds/analytics'

export function createAnalyticsTools(deps: AnalyticsToolDeps): Record<string, Tool> {
  const tools = [
    workloadByAssigneeTool(deps),
    tasksByStatusTool(deps),
    tasksByPlanTool(deps),
    queryAnalyticsTool(deps),
  ]
  return Object.fromEntries(tools.map((t) => [t.id, t])) as Record<string, Tool>
}

export async function refreshAnalyticsViews(
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>,
): Promise<void> {
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_assignee_workload`
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_plan_weekly_velocity`
}
