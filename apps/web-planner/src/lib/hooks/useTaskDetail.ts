'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@future/api-client'
import { useSession } from '@future/auth'
import { trpc } from '../trpc'
import { taskKeys } from '../query-keys'
import type { TaskDetailSnapshot } from '../board-types'

type DateLike = Date | string | null | undefined

interface RawAttachmentFile {
  kind: 'file'
  id: string
  filename: string
  contentType: string
  sizeBytes: number
  url: string
  createdBy: string
  createdAt: Date | string
  msSyncState?: string
}

interface RawAttachmentLink {
  kind: 'link'
  id: string
  url: string
  linkTitle?: string
  createdBy: string
  createdAt: Date | string
  msSyncState?: string
}

type RawAttachmentSnapshot = RawAttachmentFile | RawAttachmentLink

interface RawTaskDetailSnapshot extends Omit<
  TaskDetailSnapshot,
  'startDate' | 'dueDate' | 'updatedAt' | 'completedAt' | 'attachments'
> {
  startDate: DateLike
  dueDate: DateLike
  updatedAt: Date | string
  completedAt: DateLike
  attachments: RawAttachmentSnapshot[]
}

function toDateOrNull(value: DateLike): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function toDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? new Date(0) : date
}

function toISOStringSafe(value: Date | string): string {
  return toDate(value).toISOString()
}

type MsSyncState = 'synced' | 'pending_upload' | 'pending_download' | 'not_syncable'

const VALID_MS_SYNC_STATES: ReadonlySet<string> = new Set<MsSyncState>([
  'synced',
  'pending_upload',
  'pending_download',
  'not_syncable',
])

function toMsSyncState(value: string | undefined): MsSyncState {
  return value !== undefined && VALID_MS_SYNC_STATES.has(value) ? (value as MsSyncState) : 'synced'
}

function normalizeTaskDetail(raw: RawTaskDetailSnapshot): TaskDetailSnapshot {
  return {
    ...raw,
    startDate: toDateOrNull(raw.startDate),
    dueDate: toDateOrNull(raw.dueDate),
    updatedAt: toDate(raw.updatedAt),
    completedAt: toDateOrNull(raw.completedAt),
    attachments: raw.attachments.map((attachment) => ({
      ...attachment,
      createdAt: toDate(attachment.createdAt),
      msSyncState: toMsSyncState(attachment.msSyncState),
    })),
  }
}

export type TaskPatch = {
  title?: string
  description?: string
  progress?: 0 | 50 | 100
  priority?: 1 | 3 | 5 | 9
  startDate?: Date | null
  dueDate?: Date | null
}

interface UseTaskDetailInput {
  taskId: string
  planId: string
}

interface UseTaskDetailResult {
  task: TaskDetailSnapshot | null | undefined
  isLoading: boolean
  saving: boolean
  lastError: Error | null
  conflict: TaskDetailSnapshot | null
  update: (patch: TaskPatch) => void
  clearConflict: () => void
}

export function useTaskDetail({ taskId, planId }: UseTaskDetailInput): UseTaskDetailResult {
  const session = useSession()
  const queryClient = useQueryClient()

  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''

  const queryKey = taskKeys.detail(taskId, actorId, tenantId)

  const query = useQuery({
    queryKey,
    queryFn: async () =>
      normalizeTaskDetail(
        (await trpc.planner.tasks.getDetail.query({
          planId,
          taskId,
          actorId,
          tenantId,
        })) as RawTaskDetailSnapshot,
      ),
    enabled: Boolean(taskId && planId && actorId && tenantId),
  })

  const [saving, setSaving] = useState(false)
  const [lastError, setLastError] = useState<Error | null>(null)
  const [conflict, setConflict] = useState<TaskDetailSnapshot | null>(null)

  async function runUpdate(patch: TaskPatch, expectedVersion: string): Promise<void> {
    await trpc.planner.tasks.update.mutate({
      tenantId,
      planId,
      taskId,
      actorId,
      expectedVersion,
      ...patch,
    })
  }

  function patchHasConflict(patch: TaskPatch, server: TaskDetailSnapshot): boolean {
    const keys = Object.keys(patch) as (keyof TaskPatch)[]
    return keys.some((key) => {
      const sent = patch[key]
      const serverVal = server[key]
      if (sent instanceof Date && serverVal instanceof Date) {
        return sent.getTime() !== serverVal.getTime()
      }
      return sent !== serverVal
    })
  }

  function update(patch: TaskPatch): void {
    const task = queryClient.getQueryData<TaskDetailSnapshot>(queryKey)
    if (!task) return

    setSaving(true)
    setLastError(null)

    runUpdate(patch, toISOStringSafe(task.updatedAt))
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: taskKeys.detailBase(taskId) })
        setSaving(false)
      })
      .catch((err: unknown) => {
        const trpcErr = err as { data?: { code?: string } }
        const isConflict = trpcErr?.data?.code === 'CONFLICT'

        if (isConflict) {
          queryClient
            .refetchQueries({ queryKey })
            .then(() => {
              const fresh = queryClient.getQueryData<TaskDetailSnapshot>(queryKey)
              if (!fresh) {
                setSaving(false)
                return
              }

              if (patchHasConflict(patch, fresh)) {
                setConflict(fresh)
                setSaving(false)
              } else {
                runUpdate(patch, toISOStringSafe(fresh.updatedAt))
                  .then(() => {
                    void queryClient.invalidateQueries({
                      queryKey: taskKeys.detailBase(taskId),
                    })
                    setSaving(false)
                  })
                  .catch((retryErr: unknown) => {
                    setLastError(retryErr instanceof Error ? retryErr : new Error(String(retryErr)))
                    setSaving(false)
                  })
              }
            })
            .catch((refetchErr: unknown) => {
              setLastError(refetchErr instanceof Error ? refetchErr : new Error(String(refetchErr)))
              setSaving(false)
            })
        } else {
          setLastError(err instanceof Error ? err : new Error(String(err)))
          setSaving(false)
        }
      })
  }

  function clearConflict(): void {
    setConflict(null)
  }

  return {
    task: query.data,
    isLoading: query.isLoading,
    saving,
    lastError,
    conflict,
    update,
    clearConflict,
  }
}
