'use client'
import { EChart } from '@future/charts'
import { progressDonutOption } from '@/lib/echarts-options'
import type { ProgressCounts } from '@/lib/charts-data'
import type { TaskFlat } from '@future/api-client/planner'

export function ProgressDonut({
  counts,
  onDrill,
}: {
  counts: ProgressCounts
  onDrill: (d: { field: 'progress'; value: TaskFlat['progress'] }) => void
}) {
  const option = progressDonutOption(counts)
  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="mb-3 text-sm font-medium">By Progress</h3>
      <EChart
        option={option}
        style={{ height: 260 }}
        onEvents={{
          click: (p: unknown) => {
            const name = (p as { name: string }).name
            const map: Record<string, TaskFlat['progress']> = {
              'Not started': 'not-started',
              'In progress': 'in-progress',
              Completed: 'completed',
            }
            const v = map[name]
            if (v) onDrill({ field: 'progress', value: v })
          },
        }}
      />
    </div>
  )
}
