'use client'

import { useRef, useState, useEffect } from 'react'
import { useQueryClient } from '@future/api-client'
import { useSession } from '@future/auth'
import { Spinner } from '@future/ui'
import { BucketPicker } from '../../pickers/BucketPicker'
import { trpc } from '@/lib/trpc'
import { taskKeys } from '@/lib/query-keys'
import type { BoardSnapshot, TaskDetailSnapshot } from '@/lib/board-types'

interface Props {
  taskId: string
  planId: string
  task: TaskDetailSnapshot
}

export function BucketField({ taskId, planId, task }: Props) {
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

  const boardSnapshot = queryClient.getQueryData<BoardSnapshot>(
    taskKeys.board(planId, actorId, tenantId),
  )
  const buckets = (boardSnapshot?.buckets ?? []).map((b) => ({ id: b.id, name: b.name }))

  async function handleSelect(bucketId: string) {
    setOpen(false)
    if (bucketId === task.bucketId) return
    setSaving(true)
    try {
      await trpc.planner.tasks.move.mutate({
        tenantId,
        planId,
        taskId,
        actorId,
        expectedVersion: task.updatedAt.toISOString(),
        toBucketId: bucketId,
      })
      await queryClient.invalidateQueries({ queryKey: taskKeys.detailBase(taskId) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative" ref={ref} data-testid="bucket-field">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white/4"
        aria-label={`Bucket: ${task.bucketName}`}
      >
        <span className="flex-1 text-left text-sm">{task.bucketName}</span>
        {saving && <Spinner className="size-3" />}
      </button>
      {open && (
        <BucketPicker
          buckets={buckets}
          currentBucketId={task.bucketId}
          onSelect={(id) => void handleSelect(id)}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
