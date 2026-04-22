'use client'

import { useMemo } from 'react'
import { ScheduleCalendar } from '@future/schedule'
import '@future/schedule/styles.css'
import { Alert, AlertDescription, Skeleton } from '@future/ui'
import { useMyDay } from '@/lib/hooks/use-my-day'
import { useMyDayContext } from '../my-day-context'
import { MyDayEmptyState } from '@/components/my-day/MyDayEmptyState'

export default function MyDaySchedulePage() {
  const { date } = useMyDayContext()
  const { data, isLoading, error } = useMyDay(date)

  const items = useMemo(
    () =>
      (data ?? [])
        .filter((t) => t.startDate || t.dueDate)
        .map((t) => ({
          id: t.id,
          title: t.title,
          startDate: t.startDate,
          dueDate: t.dueDate,
          payload: { planName: t.planName, planKind: t.planKind },
        })),
    [data],
  )

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load My Day.</AlertDescription>
      </Alert>
    )
  }
  if (!data || data.length === 0) return <MyDayEmptyState />

  if (items.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          No dated tasks today. Set a start or due date on a task to see it here.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="flex min-h-0 flex-1">
      <ScheduleCalendar
        items={items}
        view="dayGridWeek"
        onViewChange={() => {}}
        onChange={() => {}}
        readOnly
        availableViews={['dayGridWeek', 'dayGridMonth']}
      />
    </div>
  )
}
