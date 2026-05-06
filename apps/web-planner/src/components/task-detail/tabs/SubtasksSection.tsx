'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@future/api-client'
import { useSession } from '@future/auth'
import { Button, Input } from '@future/ui'
import { Plus } from '@future/ui/icons'
import { trpc } from '@/lib/trpc'

interface Props {
  taskId: string
  planId: string
  bucketId: string
}

interface SubtaskItem {
  id: string
  title: string
  progress: number
}

export function SubtasksSection({ taskId, planId, bucketId }: Props) {
  const session = useSession()
  const queryClient = useQueryClient()
  const [newTitle, setNewTitle] = useState('')

  const tenantId = session?.tenantId ?? ''
  const actorId = session?.actorId ?? ''

  const { data, isLoading } = useQuery({
    queryKey: ['planner.subtasks.list', taskId, planId, tenantId],
    queryFn: () =>
      trpc.planner.subtasks.list.query({
        tenantId,
        planId,
        parentTaskId: taskId,
      }) as Promise<{ subtasks: SubtaskItem[] }>,
    enabled: Boolean(tenantId && planId && taskId),
    staleTime: 5_000,
  })

  const subtasks: SubtaskItem[] = data?.subtasks ?? []

  const handleCreate = async () => {
    const title = newTitle.trim()
    if (!title) return

    try {
      await trpc.planner.subtasks.create.mutate({
        tenantId,
        planId,
        bucketId,
        parentTaskId: taskId,
        actorId,
        title,
      })
      setNewTitle('')
      void queryClient.invalidateQueries({ queryKey: ['planner.subtasks.list', taskId] })
    } catch (err) {
      console.error('Failed to create subtask', err)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      void handleCreate()
    }
  }

  const completedCount = subtasks.filter((s) => s.progress === 100).length

  return (
    <section aria-label="Subtasks" className="flex flex-col gap-2 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Subtasks
        {subtasks.length > 0 && (
          <span className="ml-1 font-normal text-fg-muted">
            ({completedCount}/{subtasks.length})
          </span>
        )}
      </p>

      {isLoading && <p className="text-sm text-fg-muted">Loading…</p>}

      {subtasks.map((subtask) => (
        <div
          key={subtask.id}
          data-testid={`subtask-${subtask.id}`}
          className="flex items-center gap-2 rounded px-2 py-1 hover:bg-accent"
        >
          <span
            className={`flex-1 text-sm ${subtask.progress === 100 ? 'line-through text-fg-muted' : ''}`}
          >
            {subtask.title}
          </span>
        </div>
      ))}

      <div className="flex items-center gap-2">
        <Input
          data-testid="new-subtask-input"
          placeholder="Add a subtask…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 text-sm"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void handleCreate()}
          disabled={!newTitle.trim()}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
    </section>
  )
}
