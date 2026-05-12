import type { Tool } from '@seta/agent-core'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'

export interface WorkloadAnalysisDeps {
  registry: { requireConsent(tenantId: string, connectorId: string): Promise<void> }
  buildSql: () => (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>
  directory: { displayName(userId: string): Promise<string | null> }
}

const Input = z.object({
  scope: z.object({
    kind: z.literal('plan'),
    planId: z.string().min(1),
  }),
})

const RowSchema = z.object({
  assigneeId: z.string(),
  displayName: z.string(),
  taskCount: z.number(),
  overdueCount: z.number(),
  inProgressCount: z.number(),
})

const Output = z.object({
  rows: z.array(RowSchema),
  chart: z.object({
    type: z.literal('bar'),
    series: z.array(
      z.object({
        label: z.string(),
        data: z.array(z.object({ x: z.string(), y: z.number() })),
      }),
    ),
  }),
})

interface RawRow {
  assigneeId: string
  taskCount: number
  overdueCount: number
  inProgressCount: number
}

export function workloadAnalysisTool(
  deps: WorkloadAnalysisDeps,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.workload_analysis',
    description: 'Aggregate Planner task load per assignee for a plan. Returns chart-ready data.',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        const tenantId = tenantContext.getTenantId()
        await deps.registry.requireConsent(tenantId, 'ms365-planner')

        const sql = deps.buildSql()
        const rawRows = (await sql`
          SELECT unnest(assignee_ids) AS "assigneeId",
                 count(*)::int AS "taskCount",
                 count(*) FILTER (WHERE due_date < now() AND percent_complete < 100)::int AS "overdueCount",
                 count(*) FILTER (WHERE percent_complete > 0 AND percent_complete < 100)::int AS "inProgressCount"
          FROM connector_ms365_planner.planner_tasks_cache
          WHERE plan_id = ${input.scope.planId}
            AND tenant_id = ${tenantId}
            AND soft_deleted_at IS NULL
          GROUP BY 1
          ORDER BY "taskCount" DESC
          LIMIT 20
        `) as RawRow[]

        const rows = await Promise.all(
          rawRows.map(async (row) => {
            const name = await deps.directory.displayName(row.assigneeId)
            return {
              assigneeId: row.assigneeId,
              displayName: name ?? '(unknown)',
              taskCount: Number(row.taskCount),
              overdueCount: Number(row.overdueCount),
              inProgressCount: Number(row.inProgressCount),
            }
          }),
        )

        const chart = {
          type: 'bar' as const,
          series: [
            {
              label: 'Open tasks',
              data: rows.map((r) => ({ x: r.assigneeId, y: r.taskCount })),
            },
            {
              label: 'Overdue',
              data: rows.map((r) => ({ x: r.assigneeId, y: r.overdueCount })),
            },
          ],
        }

        return { ok: true, value: { rows, chart } }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}
