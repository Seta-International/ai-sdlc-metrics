'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { useSession } from '@future/auth'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
  Avatar,
  AvatarImage,
  AvatarFallback,
} from '@future/ui'
import type { TaskFlat } from '@future/api-client/planner'
import { AssigneeAvatarStack } from '../../primitives/AssigneeAvatarStack'
import { trpc } from '../../../lib/trpc'

interface AssigneesCellProps {
  task: TaskFlat
  planMembers: { actorId: string; displayName: string }[]
}

export function AssigneesCell({ task, planMembers }: AssigneesCellProps) {
  const session = useSession()
  const [open, setOpen] = useState(false)
  // Optimistic local assignee set (null = use task.assignees)
  const [optimisticIds, setOptimisticIds] = useState<Set<string> | null>(null)

  const assignedIds = optimisticIds ?? new Set(task.assignees.map((a) => a.actorId))

  async function handleToggle(member: { actorId: string; displayName: string }) {
    if (!session) return
    const isAssigned = assignedIds.has(member.actorId)

    // Optimistic update
    const next = new Set(assignedIds)
    if (isAssigned) {
      next.delete(member.actorId)
    } else {
      next.add(member.actorId)
    }
    setOptimisticIds(next)

    try {
      if (isAssigned) {
        await trpc.planner.tasks.unassign.mutate({
          tenantId: session.tenantId,
          planId: task.planId,
          taskId: task.id,
          actorId: session.actorId,
          expectedVersion: task.updatedAt,
          assigneeId: member.actorId,
        })
      } else {
        await trpc.planner.tasks.assign.mutate({
          tenantId: session.tenantId,
          planId: task.planId,
          taskId: task.id,
          actorId: session.actorId,
          expectedVersion: task.updatedAt,
          assigneeId: member.actorId,
        })
      }
    } catch (err) {
      setOptimisticIds(null)
      console.error('[AssigneesCell] toggle failed', err)
    }
  }

  const displayAssignees = task.assignees.map((a) => ({
    actorId: a.actorId,
    name: a.displayName,
    avatarUrl: a.avatarUrl ?? undefined,
  }))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto p-0"
          aria-label="Change assignees"
          data-testid="assignees-cell-trigger"
        >
          {task.assignees.length > 0 ? (
            <AssigneeAvatarStack assignees={displayAssignees} maxVisible={3} />
          ) : (
            <span className="text-xs text-fg-muted">—</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0" data-testid="assignees-popover">
        <div className="border-b border-white/5 px-3 py-2">
          <span className="text-xs font-510 text-fg-muted">Assign to</span>
        </div>
        {planMembers.length === 0 ? (
          <div className="px-3 py-3 text-xs text-fg-muted">No members</div>
        ) : (
          <ul role="list" className="max-h-56 overflow-y-auto py-1">
            {planMembers.map((member) => {
              const isAssigned = assignedIds.has(member.actorId)
              const initials = member.displayName.slice(0, 2).toUpperCase()
              return (
                <li key={member.actorId}>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => void handleToggle(member)}
                    aria-pressed={isAssigned}
                    aria-label={
                      isAssigned ? `Unassign ${member.displayName}` : `Assign ${member.displayName}`
                    }
                    className="w-full justify-start gap-2 px-3 py-1.5"
                    data-testid={`assignee-option-${member.actorId}`}
                  >
                    <Avatar size="sm">
                      <AvatarImage src="" alt={member.displayName} />
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                    <span className="flex-1 truncate text-sm">{member.displayName}</span>
                    {isAssigned && (
                      <Check className="size-3 flex-shrink-0 text-accent" aria-hidden />
                    )}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
