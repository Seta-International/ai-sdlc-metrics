'use client'

import { Alert, AlertDescription, Skeleton } from '@future/ui'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@future/ui'
import { usePersonalTasks } from '@/lib/hooks/use-personal-tasks'
import { usePersonalTasksCtx } from '../personal-tasks-context'
import type { TaskFlatWithPlan } from '@future/api-client/planner'

function PlanBadge({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {name}
    </span>
  )
}

export default function PersonalGridPage() {
  const { includeCompleted } = usePersonalTasksCtx()
  const { processed, isLoading, error } = usePersonalTasks({ includeCompleted })

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    )
  }

  const rows = (processed?.rows ?? []) as TaskFlatWithPlan[]

  if (rows.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          Nothing assigned to you yet. Tasks from plans you&apos;re a member of show up here
          automatically.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Progress</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Due</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((task) => (
            <TableRow key={task.id}>
              <TableCell className="font-medium">{task.title}</TableCell>
              <TableCell>
                <PlanBadge name={task.planName} />
              </TableCell>
              <TableCell>{task.progress}</TableCell>
              <TableCell>{task.priority}</TableCell>
              <TableCell>{task.dueDate ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
