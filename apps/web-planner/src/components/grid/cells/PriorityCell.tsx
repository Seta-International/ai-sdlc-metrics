'use client'

import { useState } from 'react'
import { useSession } from '@future/auth'
import { Popover, PopoverContent, PopoverTrigger, Button } from '@future/ui'
import type { TaskFlat } from '@future/api-client/planner'
import { PriorityIcon, type Priority } from '../../primitives/PriorityIcon'
import { trpc } from '../../../lib/trpc'

type PriorityString = TaskFlat['priority']

// Mapping from string to numeric API value
// Backend mapPriority: 1→urgent, 3→important, 5→medium, 9→low
const PRIORITY_TO_NUM: Record<PriorityString, Priority> = {
  urgent: 1,
  important: 3,
  medium: 5,
  low: 9,
}

const PRIORITY_OPTIONS: { value: PriorityString; label: string; num: Priority }[] = [
  { value: 'urgent', label: 'Urgent', num: 1 },
  { value: 'important', label: 'Important', num: 3 },
  { value: 'medium', label: 'Medium', num: 5 },
  { value: 'low', label: 'Low', num: 9 },
]

const PRIORITY_LABEL: Record<PriorityString, string> = {
  urgent: 'Urgent',
  important: 'Important',
  medium: 'Medium',
  low: 'Low',
}

export function PriorityCell({ task }: { task: TaskFlat }) {
  const session = useSession()
  const [open, setOpen] = useState(false)
  const [optimistic, setOptimistic] = useState<PriorityString | null>(null)

  const current = optimistic ?? task.priority
  const currentNum = PRIORITY_TO_NUM[current]

  async function handleSelect(option: (typeof PRIORITY_OPTIONS)[number]) {
    if (!session) return
    setOpen(false)
    setOptimistic(option.value)
    try {
      await trpc.planner.tasks.setPriority.mutate({
        tenantId: session.tenantId,
        planId: task.planId,
        taskId: task.id,
        actorId: session.actorId,
        expectedVersion: task.updatedAt,
        priority: option.num,
      })
    } catch (err) {
      setOptimistic(null)
      console.error('[PriorityCell] setPriority failed', err)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto gap-1.5 p-0"
          aria-label="Change priority"
          data-testid="priority-cell-trigger"
        >
          <PriorityIcon priority={currentNum} className="size-3.5" />
          <span className="text-xs">{PRIORITY_LABEL[current]}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-40 p-1" data-testid="priority-popover">
        <ul role="list">
          {PRIORITY_OPTIONS.map((opt) => (
            <li key={opt.value}>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2"
                aria-pressed={current === opt.value}
                onClick={() => void handleSelect(opt)}
                data-testid={`priority-option-${opt.value}`}
              >
                <PriorityIcon priority={opt.num} className="size-3.5" />
                {opt.label}
              </Button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
