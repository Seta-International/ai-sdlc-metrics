'use client'

import { useRef, useState, useEffect } from 'react'
import { useQueryClient } from '@future/api-client'
import { useSession } from '@future/auth'
import { Spinner } from '@future/ui'
import { DatePicker } from '../../pickers/DatePicker'
import { trpc } from '@/lib/trpc'
import { taskKeys } from '@/lib/query-keys'
import type { TaskDetailSnapshot } from '@/lib/board-types'

interface Props {
  kind: 'start' | 'due'
  taskId: string
  planId: string
  task: TaskDetailSnapshot
}

function formatDate(date: Date | null): string {
  if (!date) return 'Not set'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function DateField({ kind, taskId, planId, task }: Props) {
  const session = useSession()
  const queryClient = useQueryClient()
  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function handleChange(date: Date | null) {
    setOpen(false)
    setSaving(true)
    try {
      await trpc.planner.tasks.setDates.mutate({
        tenantId,
        planId,
        taskId,
        actorId,
        expectedVersion: task.updatedAt.toISOString(),
        startDate: kind === 'start' ? date : task.startDate,
        dueDate: kind === 'due' ? date : task.dueDate,
      })
      await queryClient.invalidateQueries({ queryKey: taskKeys.detailBase(taskId) })
    } finally {
      setSaving(false)
    }
  }

  const value = kind === 'start' ? task.startDate : task.dueDate
  const label = kind === 'start' ? 'Start date' : 'Due date'

  return (
    <div className="relative" ref={ref} data-testid={`${kind}-date-field`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white/4"
        aria-label={`${label}: ${formatDate(value)}`}
      >
        <span className="flex-1 text-left text-sm">{formatDate(value)}</span>
        {saving && <Spinner className="size-3" />}
      </button>
      {open && (
        <DatePicker
          label={label}
          value={value}
          onChange={(d) => void handleChange(d)}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
