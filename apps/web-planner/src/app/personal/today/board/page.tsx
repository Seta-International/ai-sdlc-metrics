'use client'

import { Alert, AlertDescription, Skeleton } from '@future/ui'
import { useMyDay } from '@/lib/hooks/use-my-day'
import { useMyDayContext } from '../my-day-context'
import { MyDayEmptyState } from '@/components/my-day/my-day-empty-state'
import { AddToMyDayButton } from '@/components/my-day/add-to-my-day-button'
import { PersonalPlanBadge } from '@/components/personal-plan-badge'
import type { MyDayTask } from '@future/api-client/planner'

type ProgressKey = MyDayTask['progress']

const GROUP_ORDER: { key: ProgressKey; label: string }[] = [
  { key: 'not-started', label: 'Not started' },
  { key: 'in-progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
]

export default function MyDayBoardPage() {
  const { date } = useMyDayContext()
  const { data, isLoading, error } = useMyDay(date)

  if (isLoading) {
    return (
      <div className="flex gap-4 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-96 w-72" />
        ))}
      </div>
    )
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load My Day.</AlertDescription>
      </Alert>
    )
  }
  if (!data || data.length === 0) return <MyDayEmptyState />

  const grouped = new Map<ProgressKey, MyDayTask[]>()
  for (const t of data) {
    const list = grouped.get(t.progress) ?? []
    list.push(t)
    grouped.set(t.progress, list)
  }

  return (
    <div className="flex gap-4 overflow-x-auto p-4">
      {GROUP_ORDER.map(({ key, label }) => {
        const tasks = grouped.get(key) ?? []
        return (
          <div key={key} className="flex w-72 shrink-0 flex-col gap-2">
            <h3 className="px-1 text-sm font-semibold text-muted-foreground">
              {label} · {tasks.length}
            </h3>
            {tasks.map((task) => (
              <div
                key={task.id}
                className="flex flex-col gap-2 rounded-md border bg-card p-3 text-sm shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{task.title}</span>
                  <PersonalPlanBadge planName={task.planName} planKind={task.planKind} />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{task.dueDate ? `Due ${task.dueDate.slice(0, 10)}` : ''}</span>
                  <AddToMyDayButton task={task} inMyDay mode="button" />
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
