'use client'
import { useMemo } from 'react'
import { ScheduleCalendar } from '@future/schedule'
import type { ScheduleView } from '@future/schedule'
import '@future/schedule/styles.css'
import { Alert, AlertDescription, Skeleton } from '@future/ui'
import { usePersonalTasks } from '@/lib/hooks/use-personal-tasks'
import { useViewState } from '@/lib/hooks/useViewState'
import { usePersonalTasksCtx } from '../personal-tasks-context'

export default function SchedulePage() {
  const { includeCompleted } = usePersonalTasksCtx()
  const { processed, isLoading, error } = usePersonalTasks({ includeCompleted })
  const { state, patch } = useViewState({ scope: 'personal' })
  const view: ScheduleView = state.scale === 'month' ? 'dayGridMonth' : 'dayGridWeek'

  const items = useMemo(
    () =>
      (processed?.rows ?? [])
        .filter((t) => t.startDate || t.dueDate)
        .map((t) => ({
          id: t.id,
          title: t.title,
          startDate: t.startDate,
          dueDate: t.dueDate,
          payload: { planName: t.planName, planKind: t.planKind },
        })),
    [processed?.rows],
  )

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load tasks.</AlertDescription>
      </Alert>
    )

  if (items.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          No dated tasks to schedule. Set a start or due date on a task to see it here.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="flex flex-1 min-h-0">
      <ScheduleCalendar
        items={items}
        view={view}
        onViewChange={(v) => patch({ scale: v === 'dayGridMonth' ? 'month' : 'week' })}
        onChange={() => {}}
        readOnly
        availableViews={['dayGridWeek', 'dayGridMonth']}
      />
    </div>
  )
}
