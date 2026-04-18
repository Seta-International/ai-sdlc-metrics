'use client'

import { useQueryClient } from '@tanstack/react-query'
import { Popover, PopoverContent, Avatar, AvatarImage, AvatarFallback, Button } from '@future/ui'
import { trpc } from '../../lib/trpc'
import type { BoardSnapshot, PlanMember, BoardTaskSnapshot } from '../../lib/board-types'

interface AssigneePickerProps {
  task: BoardTaskSnapshot
  planId: string
  actorId: string
  tenantId: string
  /** Called when picker should close */
  onClose: () => void
}

/**
 * Popover showing plan members; click to assign/unassign.
 * Reads members from the board query cache (no extra network round-trip).
 */
export function AssigneePicker({ task, planId, actorId, tenantId, onClose }: AssigneePickerProps) {
  const queryClient = useQueryClient()
  const queryKey = ['tasks.getBoard', planId, actorId, tenantId] as const

  const snapshot = queryClient.getQueryData<BoardSnapshot>(queryKey)
  const members: PlanMember[] = snapshot?.plan.members ?? []

  const assignedIds = new Set(task.assignees.map((a) => a.actorId))

  async function handleToggle(member: PlanMember) {
    const isAssigned = assignedIds.has(member.actorId)

    // Optimistic cache update
    const after = queryClient.getQueryData<BoardSnapshot>(queryKey)
    if (after) {
      const updated: BoardSnapshot = {
        ...after,
        buckets: after.buckets.map((bucket) => ({
          ...bucket,
          tasks: bucket.tasks.map((t) => {
            if (t.id !== task.id) return t
            const newAssignees = isAssigned
              ? t.assignees.filter((a) => a.actorId !== member.actorId)
              : [
                  ...t.assignees,
                  {
                    actorId: member.actorId,
                    name: member.person?.name,
                    avatarUrl: member.person?.avatarUrl,
                  },
                ]
            return { ...t, assignees: newAssignees }
          }),
        })),
      }
      queryClient.setQueryData(queryKey, updated)
    }

    try {
      if (isAssigned) {
        await trpc.planner.tasks.unassign.mutate({
          tenantId,
          planId,
          taskId: task.id,
          actorId,
          expectedVersion: task.updatedAt.toISOString(),
          assigneeId: member.actorId,
        })
      } else {
        await trpc.planner.tasks.assign.mutate({
          tenantId,
          planId,
          taskId: task.id,
          actorId,
          expectedVersion: task.updatedAt.toISOString(),
          assigneeId: member.actorId,
        })
      }
      await queryClient.invalidateQueries({ queryKey })
    } catch (err) {
      // Revert
      if (after) queryClient.setQueryData(queryKey, after)
      console.error('[AssigneePicker] toggle failed', err)
    }
  }

  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <PopoverContent
        onInteractOutside={onClose}
        align="start"
        className="w-56 p-0"
        data-testid="assignee-picker"
      >
        <div className="px-3 py-2 border-b border-white/5">
          <span className="text-caption font-510 text-fg-muted">Assign to</span>
        </div>

        {members.length === 0 ? (
          <div className="px-3 py-3 text-caption font-400 text-fg-subtle">No members</div>
        ) : (
          <ul role="list" className="max-h-56 overflow-y-auto py-1">
            {members.map((member) => {
              const isAssigned = assignedIds.has(member.actorId)
              const name = member.person?.name ?? member.actorId
              const initials = (member.person?.name ?? member.actorId).slice(0, 2).toUpperCase()

              return (
                <li key={member.actorId}>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => void handleToggle(member)}
                    aria-pressed={isAssigned}
                    aria-label={isAssigned ? `Unassign ${name}` : `Assign ${name}`}
                    className="w-full justify-start gap-2 px-3 py-1.5"
                    data-testid={`assignee-option-${member.actorId}`}
                  >
                    <Avatar size="sm">
                      <AvatarImage src={member.person?.avatarUrl ?? ''} alt={name} />
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>

                    <span className="flex-1 truncate text-small font-510">{name}</span>

                    {isAssigned && (
                      <svg
                        viewBox="0 0 12 12"
                        fill="none"
                        className="size-3 flex-shrink-0 text-accent"
                        aria-hidden
                      >
                        <path
                          d="M2 6l3 3 5-5"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
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
