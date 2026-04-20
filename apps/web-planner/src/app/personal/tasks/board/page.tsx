'use client'
import { Alert, AlertDescription, Skeleton } from '@future/ui'
import { usePersonalTasks } from '@/lib/hooks/use-personal-tasks'
import { usePersonalTasksCtx } from '../personal-tasks-context'

export default function PersonalBoardPage() {
  const { includeCompleted } = usePersonalTasksCtx()
  const { processed, isLoading, error } = usePersonalTasks({ includeCompleted })

  if (isLoading) {
    return (
      <div className="flex gap-4 p-4">
        {['sk-0', 'sk-1', 'sk-2'].map((k) => (
          <Skeleton key={k} className="h-96 w-72" />
        ))}
      </div>
    )
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load tasks.</AlertDescription>
      </Alert>
    )
  }

  const groups = processed?.groups ?? []
  const hasAnyTask = groups.some((g) => g.tasks.length > 0)

  if (!hasAnyTask) {
    return (
      <Alert>
        <AlertDescription>
          Nothing assigned to you yet. Tasks from plans you're a member of show up here
          automatically.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="flex gap-4 overflow-x-auto p-4">
      {groups.map((g) => (
        <div key={g.key} className="flex flex-col gap-2 w-72 shrink-0">
          <h3 className="text-sm font-semibold text-muted-foreground px-1">{g.label}</h3>
          {g.tasks.map((task) => (
            <div key={task.id} className="rounded-md border bg-card p-3 text-sm shadow-sm">
              {task.title}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
