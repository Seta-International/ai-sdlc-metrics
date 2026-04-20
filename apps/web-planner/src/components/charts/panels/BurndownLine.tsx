'use client'
import { EChart } from '@future/charts'
import { Alert, AlertDescription } from '@future/ui'
import { burndownOption } from '@/lib/trends-options'
import type { TaskTrends } from '@future/api-client/planner'

export function BurndownLine({ trends }: { trends: TaskTrends }) {
  if (trends.series.length === 0) {
    return (
      <div className="rounded-lg border border-border p-4">
        <h3 className="mb-3 text-sm font-medium">Burndown</h3>
        <Alert>
          <AlertDescription>No trend data yet.</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="mb-3 text-sm font-medium">Burndown</h3>
      <EChart option={burndownOption(trends)} style={{ height: 260 }} />
    </div>
  )
}
