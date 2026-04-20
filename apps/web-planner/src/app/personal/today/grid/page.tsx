'use client'

import {
  Alert,
  AlertDescription,
  Skeleton,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@future/ui'
import { useMyDay } from '@/lib/hooks/use-my-day'
import { useMyDayContext } from '../my-day-context'
import { MyDayEmptyState } from '@/components/my-day/my-day-empty-state'
import { AddToMyDayButton } from '@/components/my-day/add-to-my-day-button'
import { PersonalPlanBadge } from '@/components/personal-plan-badge'

export default function MyDayGridPage() {
  const { date } = useMyDayContext()
  const { data, isLoading, error } = useMyDay(date)

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {['a', 'b', 'c', 'd', 'e'].map((k) => (
          <Skeleton key={k} className="h-10 w-full" />
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
            <TableHead className="w-px" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((task) => (
            <TableRow key={task.id}>
              <TableCell className="font-medium">{task.title}</TableCell>
              <TableCell>
                <PersonalPlanBadge planName={task.planName} planKind={task.planKind} />
              </TableCell>
              <TableCell>{task.progress}</TableCell>
              <TableCell>{task.priority}</TableCell>
              <TableCell>{task.dueDate ? task.dueDate.slice(0, 10) : '—'}</TableCell>
              <TableCell>
                <AddToMyDayButton task={task} inMyDay mode="button" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
