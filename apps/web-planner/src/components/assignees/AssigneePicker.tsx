'use client'

import { useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
  const containerRef = useRef<HTMLDivElement>(null)
  const queryKey = ['tasks.getBoard', planId, actorId, tenantId] as const

  const snapshot = queryClient.getQueryData<BoardSnapshot>(queryKey)
  const members: PlanMember[] = snapshot?.plan.members ?? []

  const assignedIds = new Set(task.assignees.map((a) => a.actorId))

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

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
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Assign members"
      className="absolute z-50 mt-1 w-56 rounded-lg border border-white/8 bg-surface shadow-dialog"
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
            const initials = name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()

            return (
              <li key={member.actorId}>
                <button
                  type="button"
                  onClick={() => void handleToggle(member)}
                  aria-pressed={isAssigned}
                  aria-label={isAssigned ? `Unassign ${name}` : `Assign ${name}`}
                  className={[
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors',
                    'hover:bg-elevated',
                    isAssigned ? 'text-fg-primary' : 'text-fg-secondary',
                  ].join(' ')}
                  data-testid={`assignee-option-${member.actorId}`}
                >
                  {/* Avatar */}
                  <span className="flex size-6 flex-shrink-0 items-center justify-center rounded-full bg-brand/20 text-tiny font-510 text-accent">
                    {member.person?.avatarUrl ? (
                      <img
                        src={member.person.avatarUrl}
                        alt={name}
                        className="size-6 rounded-full object-cover"
                      />
                    ) : (
                      initials
                    )}
                  </span>

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
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
