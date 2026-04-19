'use client'

import { useState } from 'react'
import { useSession } from '@future/auth'
import { Popover, PopoverContent, PopoverTrigger, Button } from '@future/ui'
import type { TaskFlat } from '@future/api-client/planner'
import { ProgressIcon } from '../../primitives/ProgressIcon'
import { trpc } from '../../../lib/trpc'

type ProgressString = TaskFlat['progress']
type ProgressNum = 0 | 50 | 100

const PROGRESS_OPTIONS: { value: ProgressString; label: string; num: ProgressNum }[] = [
  { value: 'not-started', label: 'Not started', num: 0 },
  { value: 'in-progress', label: 'In progress', num: 50 },
  { value: 'completed', label: 'Completed', num: 100 },
]

const PROGRESS_NUM: Record<ProgressString, ProgressNum> = {
  'not-started': 0,
  'in-progress': 50,
  completed: 100,
}

export function ProgressCell({ task }: { task: TaskFlat }) {
  const session = useSession()
  const [open, setOpen] = useState(false)
  const [optimistic, setOptimistic] = useState<ProgressString | null>(null)

  const current = optimistic ?? task.progress
  const currentNum = PROGRESS_NUM[current]

  async function handleSelect(option: (typeof PROGRESS_OPTIONS)[number]) {
    if (!session) return
    setOpen(false)
    setOptimistic(option.value)
    try {
      await trpc.planner.tasks.setProgress.mutate({
        tenantId: session.tenantId,
        planId: task.planId,
        taskId: task.id,
        actorId: session.actorId,
        expectedVersion: task.updatedAt,
        progress: option.num,
      })
    } catch (err) {
      setOptimistic(null)
      console.error('[ProgressCell] setProgress failed', err)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto gap-1.5 p-0"
          aria-label="Change progress"
          data-testid="progress-cell-trigger"
        >
          <ProgressIcon progress={currentNum as ProgressNum} className="size-3.5" />
          <span className="text-xs capitalize">{current.replace('-', ' ')}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-1" data-testid="progress-popover">
        <ul role="list">
          {PROGRESS_OPTIONS.map((opt) => (
            <li key={opt.value}>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2"
                aria-pressed={current === opt.value}
                onClick={() => void handleSelect(opt)}
                data-testid={`progress-option-${opt.value}`}
              >
                <ProgressIcon progress={opt.num} className="size-3.5" />
                {opt.label}
              </Button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
