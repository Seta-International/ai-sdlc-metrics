'use client'
import { useCallback, useMemo, useState } from 'react'
import { useSession } from '@future/auth'
import type { ScheduleChange, ScheduleClear, ScheduleItem } from '@future/schedule'
import type { TaskFlat } from '@future/api-client/planner'
import { trpc } from '@/lib/trpc'
import { useViewState } from '@/lib/hooks/useViewState'

export type PendingClear = ScheduleClear<TaskFlat>

export function usePlannerSchedule(planId: string, tasks: TaskFlat[]) {
  const session = useSession()
  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''
  const { state } = useViewState({ planId })
  const [pendingClear, setPendingClear] = useState<PendingClear | null>(null)

  const items = useMemo<ScheduleItem<TaskFlat>[]>(
    () =>
      tasks.map((t) => ({
        id: t.id,
        title: t.title,
        startDate: t.startDate,
        dueDate: t.dueDate,
        color: colorForGroup(t, state.groupBy),
        version: t.updatedAt,
        payload: t,
      })),
    [tasks, state.groupBy],
  )

  const onChange = useCallback(
    (ev: ScheduleChange<TaskFlat>) => {
      trpc.planner.tasks.setDates.mutate({
        tenantId,
        planId,
        taskId: ev.id,
        actorId,
        startDate: ev.next.startDate ? new Date(ev.next.startDate) : null,
        dueDate: new Date(ev.next.dueDate),
        expectedVersion: ev.version ?? '',
      })
    },
    [tenantId, planId, actorId],
  )

  const setClear = useCallback((ev: ScheduleClear<TaskFlat>) => {
    setPendingClear(ev)
  }, [])

  const confirmClear = useCallback(() => {
    if (!pendingClear) return
    trpc.planner.tasks.setDates.mutate({
      tenantId,
      planId,
      taskId: pendingClear.id,
      actorId,
      startDate: null,
      dueDate: null,
      expectedVersion: pendingClear.version ?? '',
    })
    setPendingClear(null)
  }, [pendingClear, tenantId, planId, actorId])

  const cancelClear = useCallback(() => setPendingClear(null), [])

  return { items, onChange, setClear, confirmClear, cancelClear, pendingClear }
}

function colorForGroup(t: TaskFlat, groupBy: string): string | undefined {
  switch (groupBy) {
    case 'priority':
      return `var(--chart-priority-${t.priority})`
    case 'progress':
      return `var(--chart-progress-${t.progress})`
    default:
      return undefined
  }
}
