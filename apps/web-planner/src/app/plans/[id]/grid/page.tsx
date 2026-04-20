'use client'

import { Alert, AlertDescription, Skeleton } from '@future/ui'
import { useFlatTasks } from '@/lib/hooks/useFlatTasks'
import { TaskGrid } from '@/components/grid/TaskGrid'

const GRID_SKELETON_SLOTS = Array.from({ length: 10 }, (_, i) => `row-${i}`)

export default function GridPage({ params }: { params: { id: string } }) {
  const { processed, isLoading, error } = useFlatTasks({ planId: params.id })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {GRID_SKELETON_SLOTS.map((slot) => (
          <Skeleton key={slot} className="h-12 w-full" />
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

  return (
    <TaskGrid
      planId={params.id}
      data={processed?.rows ?? []}
      groups={processed?.groups}
      context={{ members: [], labels: [] }}
    />
  )
}
