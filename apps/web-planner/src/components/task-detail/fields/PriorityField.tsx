'use client'

import { useRef, useState, useEffect } from 'react'
import { useQueryClient } from '@future/api-client'
import { useSession } from '@future/auth'
import { Button, Spinner } from '@future/ui'
import { PriorityIcon, type Priority } from '../../primitives/PriorityIcon'
import { PriorityPicker } from '../../pickers/PriorityPicker'
import { trpc } from '@/lib/trpc'
import { taskKeys } from '@/lib/query-keys'
import type { TaskDetailSnapshot } from '@/lib/board-types'

const PRIORITY_LABEL: Record<Priority, string> = {
  1: 'Low',
  3: 'Normal',
  5: 'Important',
  9: 'Urgent',
}

interface Props {
  taskId: string
  planId: string
  task: TaskDetailSnapshot
}

export function PriorityField({ taskId, planId, task }: Props) {
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

  async function handleSelect(priority: Priority) {
    setOpen(false)
    setSaving(true)
    try {
      const detailKey = taskKeys.detail(taskId, actorId, tenantId)
      const cached = queryClient.getQueryData<TaskDetailSnapshot>(detailKey)

      const attempt = async (expectedVersion: string): Promise<void> => {
        await trpc.planner.tasks.setPriority.mutate({
          tenantId,
          planId,
          taskId,
          actorId,
          expectedVersion,
          priority,
        })
      }

      try {
        await attempt((cached ?? task).updatedAt.toISOString())
      } catch (err) {
        const isConflict = (err as { data?: { code?: string } })?.data?.code === 'CONFLICT'
        if (!isConflict) return
        await queryClient.refetchQueries({ queryKey: detailKey })
        const fresh = queryClient.getQueryData<TaskDetailSnapshot>(detailKey)
        if (fresh) await attempt(fresh.updatedAt.toISOString())
      }

      await queryClient.invalidateQueries({ queryKey: taskKeys.detailBase(taskId) })
    } finally {
      setSaving(false)
    }
  }

  const priority = task.priority as Priority

  return (
    <div className="relative" ref={ref} data-testid="priority-field">
      <Button
        variant="ghost"
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-sm"
        aria-label={`Priority: ${PRIORITY_LABEL[priority]}`}
      >
        <PriorityIcon priority={priority} />
        <span className="flex-1 text-left">{PRIORITY_LABEL[priority]}</span>
        {saving && <Spinner className="size-3" />}
      </Button>
      {open && (
        <PriorityPicker
          currentPriority={priority}
          onSelect={(p) => void handleSelect(p)}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
