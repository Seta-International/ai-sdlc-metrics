'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '@future/auth'
import { trpc } from '../trpc'
import type { TaskDetailSnapshot } from '../board-types'

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

  const queryKey = ['tasks.getDetail', taskId, actorId, tenantId] as const

  const query = useQuery({
    queryKey,
    queryFn: () =>
      trpc.planner.tasks.getDetail.query({
        planId,
        taskId,
        actorId,
        tenantId,
      }) as Promise<TaskDetailSnapshot>,
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

    runUpdate(patch, task.updatedAt.toISOString())
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['tasks.getDetail', taskId] as const })
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
                runUpdate(patch, fresh.updatedAt.toISOString())
                  .then(() => {
                    void queryClient.invalidateQueries({
                      queryKey: ['tasks.getDetail', taskId] as const,
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
