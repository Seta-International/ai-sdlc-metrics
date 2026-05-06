'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@future/api-client'
import { useSession } from '@future/auth'
import { Button } from '@future/ui'
import { X, Plus } from '@future/ui/icons'
import { trpc } from '@/lib/trpc'
import { taskKeys } from '@/lib/query-keys'
import { TaskSearchPicker } from './TaskSearchPicker'

type DependencyKind = 'finish_to_start' | 'start_to_start' | 'finish_to_finish'

interface Dep {
  taskId: string
  title: string
  kind: string
}

interface Props {
  taskId: string
  planId: string
  tenantId: string
  actorId: string
  predecessors: Dep[]
  successors: Dep[]
}

export function DependenciesSection({
  taskId,
  planId,
  tenantId,
  actorId,
  predecessors,
  successors,
}: Props) {
  const session = useSession()
  const queryClient = useQueryClient()
  const [showPicker, setShowPicker] = useState<'predecessor' | 'successor' | null>(null)

  const resolvedActorId = actorId || session?.actorId || ''
  const resolvedTenantId = tenantId || session?.tenantId || ''

  const { data: flatTasks } = useQuery({
    queryKey: taskKeys.flat(planId, resolvedActorId, resolvedTenantId),
    queryFn: () =>
      trpc.planner.tasks.getFlat.query({
        planId,
        actorId: resolvedActorId,
        tenantId: resolvedTenantId,
      }),
    enabled: Boolean(planId && resolvedActorId && resolvedTenantId),
    staleTime: 5_000,
  })

  const availableTasks = (Array.isArray(flatTasks) ? flatTasks : []).map(
    (t: { id: string; title: string }) => ({
      id: t.id,
      title: t.title,
    }),
  )

  const handleRemove = async (dep: Dep, direction: 'predecessor' | 'successor') => {
    const fromTaskId = direction === 'predecessor' ? dep.taskId : taskId
    const toTaskId = direction === 'predecessor' ? taskId : dep.taskId

    try {
      await trpc.planner.dependencies.remove.mutate({
        tenantId: resolvedTenantId,
        planId,
        actorId: resolvedActorId,
        fromTaskId,
        toTaskId,
        kind: dep.kind as DependencyKind,
      })
      void queryClient.invalidateQueries({ queryKey: taskKeys.detailBase(taskId) })
    } catch (err) {
      console.error('Failed to remove dependency', err)
    }
  }

  const handleAdd = async (selectedTaskId: string, direction: 'predecessor' | 'successor') => {
    const fromTaskId = direction === 'predecessor' ? selectedTaskId : taskId
    const toTaskId = direction === 'predecessor' ? taskId : selectedTaskId

    try {
      await trpc.planner.dependencies.add.mutate({
        tenantId: resolvedTenantId,
        planId,
        actorId: resolvedActorId,
        fromTaskId,
        toTaskId,
        kind: 'finish_to_start' as DependencyKind,
      })
      void queryClient.invalidateQueries({ queryKey: taskKeys.detailBase(taskId) })
      setShowPicker(null)
    } catch (err) {
      console.error('Failed to add dependency', err)
    }
  }

  const hasDeps = predecessors.length > 0 || successors.length > 0

  return (
    <section aria-label="Dependencies" className="flex flex-col gap-3 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Dependencies
      </p>

      {!hasDeps && <p className="text-sm text-fg-muted">No dependencies</p>}

      {predecessors.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-fg-muted">Predecessors</p>
          {predecessors.map((dep) => (
            <div
              key={dep.taskId}
              className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-accent"
            >
              <span className="flex-1 text-sm">{dep.title}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                type="button"
                data-testid={`remove-dep-${dep.taskId}`}
                aria-label={`Remove predecessor ${dep.title}`}
                onClick={() => void handleRemove(dep, 'predecessor')}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {successors.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-fg-muted">Successors</p>
          {successors.map((dep) => (
            <div
              key={dep.taskId}
              className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-accent"
            >
              <span className="flex-1 text-sm">{dep.title}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                type="button"
                data-testid={`remove-dep-${dep.taskId}`}
                aria-label={`Remove successor ${dep.title}`}
                onClick={() => void handleRemove(dep, 'successor')}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => setShowPicker(showPicker === 'predecessor' ? null : 'predecessor')}
        >
          <Plus className="size-3.5" />
          Add predecessor
        </Button>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => setShowPicker(showPicker === 'successor' ? null : 'successor')}
        >
          <Plus className="size-3.5" />
          Add successor
        </Button>
      </div>

      {showPicker && (
        <TaskSearchPicker
          tasks={availableTasks}
          excludeId={taskId}
          onSelect={(selectedId) => void handleAdd(selectedId, showPicker)}
        />
      )}
    </section>
  )
}
