'use client'
import { ScheduleCalendar } from '@future/schedule'
import type { ScheduleView } from '@future/schedule'
import '@future/schedule/styles.css'
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Skeleton,
} from '@future/ui'
import { useFlatTasks } from '@/lib/hooks/useFlatTasks'
import { usePlannerSchedule } from '@/lib/hooks/usePlannerSchedule'
import { useViewRenderedTelemetry } from '@/lib/hooks/useViewRenderedTelemetry'
import { useViewState } from '@/lib/hooks/useViewState'
import type { ViewState } from '@/lib/view-state'

export default function SchedulePage({ params }: { params: { id: string } }) {
  const { processed, isLoading, error } = useFlatTasks({ planId: params.id })
  const { state, patch } = useViewState({ planId: params.id })
  const view: ScheduleView = state.scale === 'month' ? 'dayGridMonth' : 'dayGridWeek'
  const tasks = processed?.rows ?? []
  const { items, onChange, setClear, confirmClear, cancelClear, pendingClear } = usePlannerSchedule(
    params.id,
    tasks,
  )

  useViewRenderedTelemetry({
    view: 'schedule',
    planId: params.id,
    taskCount: tasks.length,
    filterKeys: Object.keys(state.filter).filter((k) => {
      const v = (state.filter as Record<string, unknown>)[k]
      if (v === undefined || v === null) return false
      if (Array.isArray(v)) return v.length > 0
      return true
    }),
    groupBy: state.groupBy,
  })

  if (isLoading) return <Skeleton className="h-[60vh]" />
  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load tasks.</AlertDescription>
      </Alert>
    )

  return (
    <>
      <div className="h-[calc(100vh-11rem)]">
        <ScheduleCalendar
          items={items}
          view={view}
          onViewChange={(v) => patch({ scale: v === 'dayGridMonth' ? 'month' : 'week' })}
          onChange={onChange}
          onClear={setClear}
          filterFirstThreshold={150}
          hasFilterApplied={hasAnyFilter(state.filter)}
          availableViews={['dayGridWeek', 'dayGridMonth']}
        />
      </div>
      <AlertDialog open={pendingClear !== null} onOpenChange={(open) => !open && cancelClear()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove dates?</AlertDialogTitle>
            <AlertDialogDescription>The task will move back to Unscheduled.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelClear}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmClear}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function hasAnyFilter(f: ViewState['filter']): boolean {
  return (
    Boolean(f.due) ||
    f.priority.length > 0 ||
    f.labels.length > 0 ||
    f.buckets.length > 0 ||
    f.assignees.length > 0
  )
}
