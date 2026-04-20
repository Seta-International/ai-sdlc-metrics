'use client'

import { TimeRangeToggle } from '@future/ui'
import { useViewState } from '@/lib/hooks/useViewState'
import type { TrendRange } from '@future/api-client/planner'

const OPTIONS: ReadonlyArray<{ value: TrendRange; label: string }> = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
]

export function RangePicker({ planId }: { planId: string }) {
  const { state, patch } = useViewState({ planId })
  const current: TrendRange = state.trendRange ?? '30d'

  return (
    <TimeRangeToggle
      value={current}
      onValueChange={(value) => patch({ trendRange: value })}
      options={OPTIONS}
      ariaLabel="Trend range"
    />
  )
}
