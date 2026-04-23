'use client'

import { MoreHorizontal } from '@future/ui/icons'
import { Button } from '@future/ui'
import type { TaskFlat } from '@future/api-client/planner'

export function ActionsCell({
  task,
  onOpen,
}: {
  task: TaskFlat
  onOpen: (taskId: string) => void
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Open task"
      onClick={() => onOpen(task.id)}
      data-testid="actions-cell-btn"
    >
      <MoreHorizontal className="size-4" />
    </Button>
  )
}
