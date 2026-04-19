'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Separator, Skeleton } from '@future/ui'
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
}

export function TaskDetailPanel({ taskId, planId }: Props) {
  const router = useRouter()
  const { task, isLoading, saving, update, conflict, clearConflict } = useTaskDetail({
    taskId,
    planId,
  })
  const [localPatch, setLocalPatch] = useState<TaskPatch | null>(null)

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
        // The board is still mounted behind this intercepting-route panel.
        // Look up the task card link by task ID to restore focus reliably.
        const taskLink = document.querySelector<HTMLElement>(
          `[data-task-id="${taskId}"] [data-testid="task-title-link"]`,
        )
        taskLink?.focus()
        router.back()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [router, taskId])

  return (
    <div className="flex h-full flex-col" data-testid="task-detail-panel">
      <TaskPanelHeader title={task?.title ?? ''} isSaving={saving} onClose={() => router.back()} />

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
