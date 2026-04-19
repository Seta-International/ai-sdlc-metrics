'use client'
import { useEffect, useRef } from 'react'
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
  const { view, planId, taskCount, filterKeys, groupBy } = payload
  const emitRef = useRef(opts?.emit ?? emitEvent)

  // Keep ref current on every render so the effect always sees the latest emit function
  useEffect(() => {
    emitRef.current = opts?.emit ?? emitEvent
  })

  useEffect(() => {
    emitRef.current('planner.view.rendered', {
      zone: 'web-planner',
      view,
      planId,
      taskCount,
      filterKeys: [...filterKeys].sort(),
      groupBy,
    })
  }, [view, planId, taskCount, groupBy, filterKeys.join(',')])
}
