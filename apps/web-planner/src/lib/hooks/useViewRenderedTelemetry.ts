'use client'
import { useEffect } from 'react'
import { emit as emitEvent } from '../telemetry'

export type ViewRenderedEvent = {
  view: 'board' | 'grid' | 'schedule' | 'charts'
  planId: string
  taskCount: number
  filterKeys: string[]
  groupBy: string
}

export function useViewRenderedTelemetry(
  payload: ViewRenderedEvent,
  opts?: { emit?: (name: string, data: unknown) => void },
) {
  const emit = opts?.emit ?? emitEvent
  const { view, planId, taskCount, filterKeys, groupBy } = payload

  useEffect(() => {
    emit('planner.view.rendered', {
      zone: 'web-planner',
      view,
      planId,
      taskCount,
      filterKeys: [...filterKeys].sort(),
      groupBy,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, planId, taskCount, groupBy, filterKeys.join(',')])
}
