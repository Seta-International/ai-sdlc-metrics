'use client'

import { useMemo } from 'react'
import { Skeleton, Alert, AlertDescription } from '@future/ui'
import { useMyDay } from '@/lib/hooks/use-my-day'
import { useMyDayContext } from '../my-day-context'
import { MyDayEmptyState } from '@/components/my-day/MyDayEmptyState'
import { ProgressDonut } from '@/components/charts/panels/ProgressDonut'
import { PriorityBar } from '@/components/charts/panels/PriorityBar'
import { reduceProgress, reducePriority } from '@/lib/charts-data'

export default function MyDayChartsPage() {
  const { date } = useMyDayContext()
  const { data, isLoading, error } = useMyDay(date)

  const progressCounts = useMemo(() => reduceProgress(data ?? []), [data])
  const priorityCounts = useMemo(() => reducePriority(data ?? []), [data])

  if (isLoading) {
    return (
      <div className="grid gap-4 p-6 sm:grid-cols-1 md:grid-cols-2">
        {['a', 'b'].map((k) => (
          <Skeleton key={k} className="h-64 w-full rounded-lg" />
        ))}
      </div>
    )
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load My Day charts.</AlertDescription>
      </Alert>
    )
  }
  if (!data || data.length === 0) return <MyDayEmptyState />

  return (
    <div className="grid gap-4 p-6 sm:grid-cols-1 md:grid-cols-2">
      <ProgressDonut counts={progressCounts} onDrill={() => {}} />
      <PriorityBar counts={priorityCounts} onDrill={() => {}} />
    </div>
  )
}
