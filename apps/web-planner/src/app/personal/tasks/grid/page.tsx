'use client'

import { Alert, AlertDescription, Skeleton } from '@future/ui'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@future/ui'
import { usePersonalTasks } from '@/lib/hooks/use-personal-tasks'
import { usePersonalTasksCtx } from '../personal-tasks-context'
import { PersonalPlanBadge } from '@/components/PersonalPlanBadge'
import type { TaskFlatWithPlan } from '@future/api-client/planner'

export default function PersonalGridPage() {
  const { includeCompleted } = usePersonalTasksCtx()
  const { processed, isLoading, error } = usePersonalTasks({ includeCompleted })

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {['sk-0', 'sk-1', 'sk-2', 'sk-3', 'sk-4'].map((k) => (
          <Skeleton key={k} className="h-10 w-full" />
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
                <PersonalPlanBadge planName={task.planName} planKind={task.planKind} />
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
