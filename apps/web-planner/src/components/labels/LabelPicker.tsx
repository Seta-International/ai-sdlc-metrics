'use client'

import { useQueryClient } from '@tanstack/react-query'
import { Popover, PopoverContent, Button } from '@future/ui'
import { trpc } from '../../lib/trpc'
import type { BoardSnapshot, PlanLabel, BoardTaskSnapshot } from '../../lib/board-types'

const ALL_SLOTS = Array.from({ length: 25 }, (_, i) => `category${i + 1}`)

interface LabelPickerProps {
  task: BoardTaskSnapshot
  planId: string
  actorId: string
  tenantId: string
  onClose: () => void
}

/**
 * Popover showing the 25 plan label slots; click to toggle applied/removed.
 * Reads labels from the board query cache snapshot.
 */
export function LabelPicker({ task, planId, actorId, tenantId, onClose }: LabelPickerProps) {
  const queryClient = useQueryClient()
  const queryKey = ['tasks.getBoard', planId, actorId, tenantId] as const

  const snapshot = queryClient.getQueryData<BoardSnapshot>(queryKey)
  const planLabels: PlanLabel[] = snapshot?.plan.labels ?? []
  const appliedSet = new Set(task.appliedLabels)

  function getLabelForSlot(slot: string, index: number): PlanLabel {
    return (
      planLabels.find((l) => l.slot === slot) ?? {
        slot,
        name: `Label ${index + 1}`,
        color: 'var(--color-fg-subtle)',
      }
    )
  }

  async function handleToggle(slot: string) {
    const isApplied = appliedSet.has(slot)

    // Optimistic update
    const before = queryClient.getQueryData<BoardSnapshot>(queryKey)
    if (before) {
      const updated: BoardSnapshot = {
        ...before,
        buckets: before.buckets.map((bucket) => ({
          ...bucket,
          tasks: bucket.tasks.map((t) => {
            if (t.id !== task.id) return t
            const newLabels = isApplied
              ? t.appliedLabels.filter((s) => s !== slot)
              : [...t.appliedLabels, slot]
            return { ...t, appliedLabels: newLabels }
          }),
        })),
      }
      queryClient.setQueryData(queryKey, updated)
    }

    try {
      if (isApplied) {
        await trpc.planner.tasks.removeLabel.mutate({
          tenantId,
          planId,
          taskId: task.id,
          actorId,
          expectedVersion: task.updatedAt.toISOString(),
          slot,
        })
      } else {
        await trpc.planner.tasks.applyLabel.mutate({
          tenantId,
          planId,
          taskId: task.id,
          actorId,
          expectedVersion: task.updatedAt.toISOString(),
          slot,
        })
      }
      await queryClient.invalidateQueries({ queryKey })
    } catch (err) {
      if (before) queryClient.setQueryData(queryKey, before)
      console.error('[LabelPicker] toggle failed', err)
    }
  }

  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <PopoverContent onInteractOutside={onClose} align="start" className="w-64 p-0">
        <div className="px-3 py-2 border-b border-white/5">
          <span className="text-caption font-510 text-fg-muted">Labels</span>
        </div>

        <ul role="list" className="max-h-64 overflow-y-auto py-1">
          {ALL_SLOTS.map((slot, index) => {
            const label = getLabelForSlot(slot, index)
            const isApplied = appliedSet.has(slot)

            return (
              <li key={slot}>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => void handleToggle(slot)}
                  aria-pressed={isApplied}
                  aria-label={`${isApplied ? 'Remove' : 'Apply'} label ${label.name}`}
                  className="flex w-full items-center gap-2 px-3 py-1.5 justify-start"
                  data-testid={`label-option-${slot}`}
                >
                  {/* Color dot */}
                  <span
                    className="size-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: label.color }}
                    aria-hidden
                  />

                  <span className="flex-1 truncate text-small font-510">{label.name}</span>

                  {isApplied && (
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
      </PopoverContent>
    </Popover>
  )
}
