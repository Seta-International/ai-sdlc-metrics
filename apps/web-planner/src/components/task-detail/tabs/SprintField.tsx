'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@future/api-client'
import { useSession } from '@future/auth'
import { Button } from '@future/ui'
import { ChevronDown } from '@future/ui/icons'
import { trpc } from '@/lib/trpc'
import { SprintPicker } from './SprintPicker'

interface Props {
  taskId: string
  planId: string
  currentSprintId?: string | null
  currentSprintName?: string | null
  expectedVersion: string
}

interface Sprint {
  id: string
  name: string
  startDate: string
  endDate: string
}

export function SprintField({
  taskId,
  planId,
  currentSprintId,
  currentSprintName,
  expectedVersion,
}: Props) {
  const session = useSession()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const tenantId = session?.tenantId ?? ''
  const actorId = session?.actorId ?? ''

  const { data: sprintsData } = useQuery({
    queryKey: ['planner.sprints.list', planId, tenantId],
    queryFn: () =>
      trpc.planner.sprints.list.query({ tenantId, planId }) as Promise<{ sprints: Sprint[] }>,
    enabled: Boolean(tenantId && planId),
    staleTime: 30_000,
  })

  const sprints: Sprint[] = sprintsData?.sprints ?? []

  const handleSelect = async (sprintId: string) => {
    try {
      await trpc.planner.sprints.assignTask.mutate({
        tenantId,
        planId,
        actorId,
        taskId,
        sprintId,
        expectedVersion,
      })
      void queryClient.invalidateQueries({ queryKey: ['tasks.getDetail', taskId] })
      setOpen(false)
    } catch (err) {
      console.error('Failed to assign sprint', err)
    }
  }

  const handleClear = async () => {
    try {
      await trpc.planner.sprints.unassignTask.mutate({
        tenantId,
        planId,
        actorId,
        taskId,
        expectedVersion,
      })
      void queryClient.invalidateQueries({ queryKey: ['tasks.getDetail', taskId] })
      setOpen(false)
    } catch (err) {
      console.error('Failed to unassign sprint', err)
    }
  }

  return (
    <div className="relative" data-testid="sprint-field">
      <Button
        variant="ghost"
        size="sm"
        type="button"
        className="flex items-center gap-1 text-sm"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{currentSprintName ?? 'No sprint'}</span>
        <ChevronDown className="size-3.5" />
      </Button>

      {open && (
        <div className="absolute left-0 top-full z-10 w-64 rounded-md border bg-popover p-1 shadow-md">
          <SprintPicker
            sprints={sprints}
            currentSprintId={currentSprintId}
            onSelect={(id) => void handleSelect(id)}
            onClear={currentSprintId ? () => void handleClear() : undefined}
          />
        </div>
      )}
    </div>
  )
}
