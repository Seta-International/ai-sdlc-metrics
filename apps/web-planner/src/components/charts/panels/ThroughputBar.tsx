'use client'
import { EChart } from '@future/charts'
import { Alert, AlertDescription } from '@future/ui'
import { throughputOption } from '@/lib/trends-options'
import type { TaskTrends } from '@future/api-client/planner'

export function ThroughputBar({ trends }: { trends: TaskTrends }) {
  if (trends.weeklyThroughput.length === 0) {
    return (
      <div className="rounded-lg border border-border p-4">
        <h3 className="mb-3 text-sm font-medium">Throughput per week</h3>
        <Alert>
          <AlertDescription>No completed tasks in this range.</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="mb-3 text-sm font-medium">Throughput per week</h3>
      <EChart option={throughputOption(trends)} style={{ height: 260 }} />
    </div>
  )
}
