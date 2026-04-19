'use client'
import { EChart } from '@future/charts'
import { priorityBarOption } from '@/lib/echarts-options'
import type { PriorityCounts } from '@/lib/charts-data'
import type { TaskFlat } from '@future/api-client/planner'

export function PriorityBar({
  counts,
  onDrill,
}: {
  counts: PriorityCounts
  onDrill: (d: { field: 'priority'; value: TaskFlat['priority'] }) => void
}) {
  const option = priorityBarOption(counts)
  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="mb-3 text-sm font-medium">By Priority</h3>
      <EChart
        option={option}
        style={{ height: 220 }}
        onEvents={{
          click: (p: any) => {
            const map: Record<string, TaskFlat['priority']> = {
              Urgent: 'urgent',
              Important: 'important',
              Medium: 'medium',
              Low: 'low',
            }
            const v = map[p.name]
            if (v) onDrill({ field: 'priority', value: v })
          },
        }}
      />
    </div>
  )
}
