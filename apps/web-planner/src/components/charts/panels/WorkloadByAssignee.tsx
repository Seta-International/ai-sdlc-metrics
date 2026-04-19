'use client'
import { EChart } from '@future/charts'
import { workloadBarOption } from '@/lib/echarts-options'
import type { WorkloadRow } from '@/lib/charts-data'
import type { TaskFlat } from '@future/api-client/planner'

const PRIORITY_LABEL_MAP: Record<string, TaskFlat['priority']> = {
  Urgent: 'urgent',
  Important: 'important',
  Medium: 'medium',
  Low: 'low',
}

export function WorkloadByAssignee({
  rows,
  onDrill,
}: {
  rows: WorkloadRow[]
  onDrill: (d: { field: 'workload'; assigneeId: string; priority: TaskFlat['priority'] }) => void
}) {
  const option = workloadBarOption(rows)
  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="mb-3 text-sm font-medium">Workload by Assignee</h3>
      <EChart
        option={option}
        style={{ height: Math.max(200, rows.length * 48) }}
        onEvents={{
          click: (p: any) => {
            const priority = PRIORITY_LABEL_MAP[p.seriesName]
            const row = rows.find((r) => r.displayName === p.name)
            if (priority && row) {
              onDrill({ field: 'workload', assigneeId: row.actorId, priority })
            }
          },
        }}
      />
    </div>
  )
}
