'use client'

import { useRef, useState, useEffect } from 'react'
import { useQueryClient } from '@future/api-client'
import { useSession } from '@future/auth'
import { Button } from '@future/ui'
import { Plus } from '@future/ui/icons'
import { LabelPicker } from '../../labels/LabelPicker'
import { taskKeys } from '@/lib/query-keys'
import type { BoardSnapshot, BoardTaskSnapshot, TaskDetailSnapshot } from '@/lib/board-types'

interface Props {
  taskId: string
  planId: string
  task: TaskDetailSnapshot
}

function buildTaskStub(task: TaskDetailSnapshot): BoardTaskSnapshot {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    progress: task.progress,
    priority: task.priority,
    startDate: task.startDate,
    dueDate: task.dueDate,
    orderHint: task.orderHint,
    completedAt: task.completedAt,
    completedBy: task.completedBy,
    checklistItemCount: task.checklistItemCount,
    checklistCheckedCount: task.checklistCheckedCount,
    attachmentCount: task.attachmentCount,
    commentCount: task.commentCount,
    evidenceCount: task.evidenceCount,
    hasPendingAttachment: false,
    coverAttachmentId: task.coverAttachmentId,
    appliedLabels: task.appliedLabels,
    assignees: task.assignees,
    updatedAt: task.updatedAt,
  }
}

export function LabelsField({ taskId, planId, task }: Props) {
  const session = useSession()
  const queryClient = useQueryClient()
  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''
  const [open, setOpen] = useState(false)
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
  if (!boardSnapshot) {
    queryClient.setQueryData<BoardSnapshot>(taskKeys.board(planId, actorId, tenantId), {
      plan: { id: planId, name: '', labels: [], members: [] },
      buckets: [],
    })
  }

  const planLabels = boardSnapshot?.plan.labels ?? []
  const appliedLabelObjects = task.appliedLabels
    .map((slot) => planLabels.find((l) => l.slot === slot))
    .filter(Boolean)

  const taskStub = buildTaskStub(task)

  const handlePickerClose = async () => {
    setOpen(false)
    await queryClient.invalidateQueries({ queryKey: taskKeys.detailBase(taskId) })
  }

  return (
    <div className="relative" ref={ref} data-testid="labels-field">
      <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
        <div className="flex flex-1 flex-wrap items-center gap-1">
          {appliedLabelObjects.length === 0 ? (
            <span className="text-sm text-fg-muted">No labels</span>
          ) : (
            appliedLabelObjects.map((label) =>
              label ? (
                <span
                  key={label.slot}
                  className="rounded px-1.5 py-0.5 text-xs font-510"
                  style={{ backgroundColor: label.color, color: 'white' }}
                >
                  {label.name}
                </span>
              ) : null,
            )
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Manage labels"
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
      {open && (
        <LabelPicker
          task={taskStub}
          planId={planId}
          actorId={actorId}
          tenantId={tenantId}
          onClose={() => void handlePickerClose()}
        />
      )}
    </div>
  )
}
