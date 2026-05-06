'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@future/auth'
import { Skeleton, Tabs, TabsList, TabsTrigger, TabsContent } from '@future/ui'
import { useTaskDetail } from '@/lib/hooks/useTaskDetail'
import { useConflictResolver } from '@/lib/hooks/useConflictResolver'
import { AddToMyDayButton } from '../my-day/AddToMyDayButton'
import { TaskPanelHeader } from './TaskPanelHeader'
import { ConflictBanner } from './ConflictBanner'
import { TaskDetailTab } from './tabs/TaskDetailTab'
import { TaskChecklistTab } from './tabs/TaskChecklistTab'
import { TaskFilesTab } from './tabs/TaskFilesTab'
import { TaskChatTab } from './tabs/TaskChatTab'
import { TaskHistoryPane } from './TaskHistoryPane'
import type { TaskFlatWithPlan } from '@future/api-client/planner'
import type { TaskPatch } from '@/lib/hooks/useTaskDetail'

interface Props {
  taskId: string
  planId: string
  onClose?: () => void
}

export function TaskDetailPanel({ taskId, planId, onClose }: Props) {
  const router = useRouter()
  const session = useSession()
  const { task, isLoading, saving, update, conflict, clearConflict } = useTaskDetail({
    taskId,
    planId,
  })
  const [localPatch, setLocalPatch] = useState<TaskPatch | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  const { conflictingField, myValue, theirValue, keepMine, keepTheirs } = useConflictResolver({
    conflict,
    localPatch,
    update: (patch) => {
      setLocalPatch(patch)
      update(patch)
    },
    clearConflict,
  })

  function handleClose(): void {
    if (onClose) onClose()
    else router.back()
  }

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
    // eslint-disable-next-line @eslint-react/exhaustive-deps
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

  const checklistBadge =
    task && task.checklistItemCount > 0
      ? ` ${task.checklistCheckedCount}/${task.checklistItemCount}`
      : ''
  const filesBadge =
    task && task.attachmentCount + (task.evidenceCount ?? 0) > 0
      ? ` ${task.attachmentCount + (task.evidenceCount ?? 0)}`
      : ''

  return (
    <div className="relative flex h-full flex-col" data-testid="task-detail-panel">
      <TaskPanelHeader
        title={task?.title ?? ''}
        isSaving={saving}
        onClose={handleClose}
        onHistoryOpen={() => setHistoryOpen(true)}
      />

      {taskFlatStub ? (
        <div className="flex items-center justify-end border-b px-4 py-2">
          <AddToMyDayButton task={taskFlatStub} inMyDay={false} mode="button" />
        </div>
      ) : null}

      {/* ConflictBanner above tabs — always visible regardless of active tab */}
      <ConflictBanner
        conflictingField={conflictingField}
        myValue={myValue}
        theirValue={theirValue}
        onKeepMine={keepMine}
        onKeepTheirs={keepTheirs}
      />

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
        <Tabs defaultValue="details" className="flex flex-1 flex-col overflow-hidden">
          <TabsList className="shrink-0 border-b px-4 w-full" data-testid="task-detail-tabs">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="checklist">Checklist{checklistBadge}</TabsTrigger>
            <TabsTrigger value="files">Files{filesBadge}</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
          </TabsList>
          <div className="flex-1 overflow-y-auto">
            <TabsContent value="details" className="mt-0">
              <TaskDetailTab taskId={taskId} planId={planId} task={task} />
            </TabsContent>
            <TabsContent value="checklist" className="mt-0">
              <TaskChecklistTab taskId={taskId} planId={planId} />
            </TabsContent>
            <TabsContent value="files" className="mt-0">
              <TaskFilesTab taskId={taskId} planId={planId} />
            </TabsContent>
            <TabsContent value="chat" className="mt-0">
              <TaskChatTab taskId={taskId} planId={planId} />
            </TabsContent>
          </div>
        </Tabs>
      )}

      <TaskHistoryPane
        taskId={taskId}
        planId={planId}
        tenantId={session?.tenantId ?? ''}
        actorId={session?.actorId ?? ''}
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  )
}
