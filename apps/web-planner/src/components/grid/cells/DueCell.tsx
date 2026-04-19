'use client'

import { useState } from 'react'
import { useSession } from '@future/auth'
import { Popover, PopoverContent, PopoverTrigger, Button, Input } from '@future/ui'
import type { TaskFlat } from '@future/api-client/planner'
import { DueBadge } from '../../primitives/DueBadge'
import { trpc } from '../../../lib/trpc'

export function DueCell({ task }: { task: TaskFlat }) {
  const session = useSession()
  const [open, setOpen] = useState(false)
  const [optimistic, setOptimistic] = useState<string | null | undefined>(undefined)

  // undefined = not overridden, null = cleared
  const currentDateStr = optimistic !== undefined ? optimistic : task.dueDate

  async function handleChange(dateStr: string | null) {
    if (!session) return
    setOpen(false)
    setOptimistic(dateStr)
    const startDate = task.startDate ? new Date(task.startDate) : null
    const dueDate = dateStr ? new Date(dateStr) : null
    try {
      await trpc.planner.tasks.setDates.mutate({
        tenantId: session.tenantId,
        planId: task.planId,
        taskId: task.id,
        actorId: session.actorId,
        expectedVersion: task.updatedAt,
        startDate,
        dueDate,
      })
    } catch (err) {
      setOptimistic(undefined)
      console.error('[DueCell] setDates failed', err)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto p-0"
          aria-label="Change due date"
          data-testid="due-cell-trigger"
        >
          {currentDateStr ? (
            <DueBadge dueDate={new Date(currentDateStr)} />
          ) : (
            <span className="text-xs text-fg-muted">—</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-3" data-testid="due-date-popover">
        <p className="mb-2 text-xs font-510 text-fg-muted">Due date</p>
        <Input
          type="date"
          defaultValue={currentDateStr ? currentDateStr.slice(0, 10) : ''}
          onChange={(e) => void handleChange(e.target.value || null)}
          style={{ colorScheme: 'dark' }}
          aria-label="Due date input"
          data-testid="due-date-input"
        />
        {currentDateStr && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full"
            onClick={() => void handleChange(null)}
            data-testid="due-date-clear"
          >
            Clear
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
