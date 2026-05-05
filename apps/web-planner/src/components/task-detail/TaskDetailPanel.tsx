'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Separator, Skeleton } from '@future/ui'
import type { TaskFlatWithPlan } from '@future/api-client/planner'
import { AddToMyDayButton } from '../my-day/AddToMyDayButton'
import { TaskPanelHeader } from './TaskPanelHeader'
import { TaskPropertyStrip } from './TaskPropertyStrip'
import { TaskDescription } from './TaskDescription'
import { TaskChecklist } from './TaskChecklist'
import { TaskAttachments } from './TaskAttachments'
import { TaskComments } from './TaskComments'
import { TaskEvidence } from './TaskEvidence'
import { ConflictBanner } from './ConflictBanner'
import { useTaskDetail } from '@/lib/hooks/useTaskDetail'
import { useConflictResolver } from '@/lib/hooks/useConflictResolver'
import type { TaskPatch } from '@/lib/hooks/useTaskDetail'

interface Props {
  taskId: string
  planId: string
  onClose?: () => void
}

export function TaskDetailPanel({ taskId, planId, onClose }: Props) {
  const router = useRouter()
  const { task, isLoading, saving, update, conflict, clearConflict } = useTaskDetail({
    taskId,
    planId,
  })
  const [localPatch, setLocalPatch] = useState<TaskPatch | null>(null)

  function handleClose(): void {
    if (onClose) {
      onClose()
    } else {
      router.back()
    }
  }

  function handleUpdate(patch: TaskPatch): void {
    setLocalPatch(patch)
    update(patch)
  }

  const { conflictingField, myValue, theirValue, keepMine, keepTheirs } = useConflictResolver({
    conflict,
    localPatch,
    update,
    clearConflict,
  })

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        const taskLink = document.querySelector<HTMLElement>(
          `[data-task-id="${taskId}"] [data-testid="task-title-link"]`,
        )
        taskLink?.focus()
        handleClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  const taskFlatStub: TaskFlatWithPlan | null = task
    ? {
        id: task.id,
        planId: task.planId,
        planName: '',
        planKind: 'team',
        bucketId: task.bucketId,
        bucketName: task.bucketName,
        bucketOrderHint: '',
        title: task.title,
        progress:
          task.progress === 100
            ? 'completed'
            : task.progress === 50
              ? 'in-progress'
              : 'not-started',
        priority:
          task.priority === 1
            ? 'urgent'
            : task.priority === 3
              ? 'important'
              : task.priority === 9
                ? 'low'
                : 'medium',
        startDate: task.startDate ? task.startDate.toISOString() : null,
        dueDate: task.dueDate ? task.dueDate.toISOString() : null,
        assignees: task.assignees.map((a) => ({
          actorId: a.actorId,
          displayName: a.name ?? '',
          avatarUrl: a.avatarUrl ?? null,
        })),
        labels: [],
        orderHint: task.orderHint,
        commentCount: task.commentCount,
        checklistCount: { total: task.checklistItemCount, completed: task.checklistCheckedCount },
        attachmentCount: task.attachmentCount,
        createdAt: task.updatedAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
      }
    : null

  return (
    <div className="flex h-full flex-col" data-testid="task-detail-panel">
      <TaskPanelHeader title={task?.title ?? ''} isSaving={saving} onClose={handleClose} />

      {taskFlatStub ? (
        <div className="flex items-center justify-end border-b px-4 py-2">
          <AddToMyDayButton task={taskFlatStub} inMyDay={false} mode="button" />
        </div>
      ) : null}

      <ConflictBanner
        conflictingField={conflictingField}
        myValue={myValue}
        theirValue={theirValue}
        onKeepMine={keepMine}
        onKeepTheirs={keepTheirs}
      />

      <div className="flex-1 overflow-y-auto">
        {isLoading || !task ? (
          <div
            className="flex flex-col gap-3 px-4 py-4"
            data-testid="task-detail-loading-skeleton"
            aria-label="Loading task…"
          >
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <>
            <TaskPropertyStrip
              bucketName={task.bucketName}
              progress={task.progress as 0 | 50 | 100}
              priority={task.priority as 1 | 3 | 5 | 9}
              appliedLabels={task.appliedLabels}
              planLabels={[]}
              assignees={task.assignees}
              startDate={task.startDate}
              dueDate={task.dueDate}
            />

            <Separator />

            <TaskDescription
              value={task.description}
              onChange={(v) => handleUpdate({ description: v })}
            />

            <Separator />

            <TaskChecklist taskId={taskId} planId={planId} />

            <Separator />

            <TaskAttachments taskId={taskId} planId={planId} />

            <Separator />

            <TaskComments taskId={taskId} planId={planId} />

            <Separator />

            <TaskEvidence taskId={taskId} planId={planId} />
          </>
        )}
      </div>
    </div>
  )
}
