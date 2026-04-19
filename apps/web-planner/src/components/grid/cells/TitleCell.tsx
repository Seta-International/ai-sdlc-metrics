'use client'
import { Button } from '@future/ui'
import type { TaskFlat } from '@future/api-client/planner'

export function TitleCell({ task, onOpen }: { task: TaskFlat; onOpen: (id: string) => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-auto p-0 text-left"
      onClick={() => onOpen(task.id)}
    >
      {task.title}
    </Button>
  )
}
