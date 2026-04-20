'use client'

import { Info } from 'lucide-react'
import { Alert, AlertDescription, Skeleton } from '@future/ui'
import { useTaskTrends } from '@/lib/hooks/useTaskTrends'
import { useViewState } from '@/lib/hooks/useViewState'
import type { TrendRange } from '@future/api-client/planner'
import { BurndownLine } from './panels/BurndownLine'
import { ThroughputBar } from './panels/ThroughputBar'
import { RangePicker } from './RangePicker'

export function TrendsSection({ planId, enabled }: { planId: string; enabled: boolean }) {
  const { state } = useViewState({ planId })
  const range: TrendRange = state.trendRange ?? '30d'
  const { data, isLoading } = useTaskTrends({ planId, range, enabled })

  if (!enabled) return null

  return (
    <section className="border-t border-border px-6 py-6">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Trends</h2>
        <div className="flex items-center gap-3">
          <RangePicker planId={planId} />
          <span
            aria-label="Trends are plan-wide and not affected by the filter bar"
            title="Trends are plan-wide and not affected by the filter bar"
          >
            <Info className="size-4 text-muted-foreground" />
          </span>
        </div>
      </header>

      {isLoading || !data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="w-full" style={{ height: 260 }} />
          <Skeleton className="w-full" style={{ height: 260 }} />
        </div>
      ) : data.series.length === 0 ? (
        <Alert>
          <AlertDescription>
            Trend data begins on {data.rangeStart}. Come back in a few days for a full picture.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <BurndownLine trends={data} />
          <ThroughputBar trends={data} />
        </div>
      )}
    </section>
  )
}
