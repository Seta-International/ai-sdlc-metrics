'use client'

import { useRef, useState, useEffect } from 'react'
import { useQueryClient } from '@future/api-client'
import { useSession } from '@future/auth'
import { Button, Spinner } from '@future/ui'
import { ProgressIcon, type Progress } from '../../primitives/ProgressIcon'
import { ProgressPicker } from '../../pickers/ProgressPicker'
import { trpc } from '@/lib/trpc'
import { taskKeys } from '@/lib/query-keys'
import type { TaskDetailSnapshot } from '@/lib/board-types'

const PROGRESS_LABEL: Record<Progress, string> = {
  0: 'Not started',
  50: 'In progress',
  100: 'Complete',
}

interface Props {
  taskId: string
  planId: string
  task: TaskDetailSnapshot
}

export function ProgressField({ taskId, planId, task }: Props) {
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

  async function handleSelect(progress: Progress) {
    setOpen(false)
    setSaving(true)
    try {
      await trpc.planner.tasks.setProgress.mutate({
        tenantId,
        planId,
        taskId,
        actorId,
        expectedVersion: task.updatedAt.toISOString(),
        progress,
      })
      await queryClient.invalidateQueries({ queryKey: taskKeys.detailBase(taskId) })
    } finally {
      setSaving(false)
    }
  }

  const progress = task.progress as Progress

  return (
    <div className="relative" ref={ref} data-testid="progress-field">
      <Button
        variant="ghost"
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-sm"
        aria-label={`Progress: ${PROGRESS_LABEL[progress]}`}
      >
        <ProgressIcon progress={progress} />
        <span className="flex-1 text-left">{PROGRESS_LABEL[progress]}</span>
        {saving && <Spinner className="size-3" />}
      </Button>
      {open && (
        <ProgressPicker
          currentProgress={progress}
          onSelect={(p) => void handleSelect(p)}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
