import type { Tool } from '@seta/agent-core'
import { queryAnalyticsTool } from './tools/query_analytics.js'
import { tasksByPlanTool } from './tools/tasks_by_plan.js'
import { tasksByStatusTool } from './tools/tasks_by_status.js'
import type { AnalyticsToolDeps } from './tools/workload_by_assignee.js'
import { workloadByAssigneeTool } from './tools/workload_by_assignee.js'

export type { ChartSeries, ChartYBarData } from './cards/chart-ybar.js'
export { chartYBarCard } from './cards/chart-ybar.js'
export { analyticsSchema } from './schema.js'
export { ANALYTICS_PROFILE_SEED, ANALYTICS_SLUG, ANALYTICS_TOOL_IDS } from './seeds/analytics.js'

export function createAnalyticsTools(deps: AnalyticsToolDeps): Record<string, Tool> {
  const tools = [
    workloadByAssigneeTool(deps),
    tasksByStatusTool(deps),
    tasksByPlanTool(deps),
    queryAnalyticsTool(deps),
  ]
  return Object.fromEntries(tools.map((t) => [t.id, t])) as Record<string, Tool>
}
