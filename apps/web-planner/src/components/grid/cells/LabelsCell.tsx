'use client'

import { useState } from 'react'
import { Check } from '@future/ui/icons'
import { useSession } from '@future/auth'
import { Popover, PopoverContent, PopoverTrigger, Button } from '@future/ui'
import type { TaskFlat } from '@future/api-client/planner'
import { LabelPill } from '../../primitives/LabelPill'
import { trpc } from '../../../lib/trpc'

interface LabelsCellProps {
  task: TaskFlat
  planLabels: { id: string; name: string; color: string }[]
}

export function LabelsCell({ task, planLabels }: LabelsCellProps) {
  const session = useSession()
  const [open, setOpen] = useState(false)
  // Optimistic set of applied label ids (null = use task.labels)
  const [optimisticIds, setOptimisticIds] = useState<Set<string> | null>(null)

  const appliedIds = optimisticIds ?? new Set(task.labels.map((l) => l.id))

  async function handleToggle(label: { id: string; name: string; color: string }) {
    if (!session) return
    const isApplied = appliedIds.has(label.id)

    const next = new Set(appliedIds)
    if (isApplied) {
      next.delete(label.id)
    } else {
      next.add(label.id)
    }
    setOptimisticIds(next)

    try {
      if (isApplied) {
        await trpc.planner.tasks.removeLabel.mutate({
          tenantId: session.tenantId,
          planId: task.planId,
          taskId: task.id,
          actorId: session.actorId,
          expectedVersion: task.updatedAt,
          slot: label.id,
        })
      } else {
        await trpc.planner.tasks.applyLabel.mutate({
          tenantId: session.tenantId,
          planId: task.planId,
          taskId: task.id,
          actorId: session.actorId,
          expectedVersion: task.updatedAt,
          slot: label.id,
        })
      }
    } catch (err) {
      setOptimisticIds(null)
      console.error('[LabelsCell] toggle failed', err)
    }
  }

  // Displayed labels: applied labels resolved to their full definitions
  const appliedLabels = task.labels.filter((l) => appliedIds.has(l.id))
  const MAX_VISIBLE = 3
  const visibleLabels = appliedLabels.slice(0, MAX_VISIBLE)
  const overflow = appliedLabels.length - visibleLabels.length

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto p-0"
          aria-label="Change labels"
          data-testid="labels-cell-trigger"
        >
          {visibleLabels.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              {visibleLabels.map((label) => (
                <LabelPill key={label.id} name={label.name} color={label.color} />
              ))}
              {overflow > 0 && <span className="text-xs text-fg-muted">+{overflow}</span>}
            </div>
          ) : (
            <span className="text-xs text-fg-muted">—</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0" data-testid="labels-popover">
        <div className="border-b border-white/5 px-3 py-2">
          <span className="text-xs font-510 text-fg-muted">Labels</span>
        </div>
        {planLabels.length === 0 ? (
          <div className="px-3 py-3 text-xs text-fg-muted">No labels defined</div>
        ) : (
          <ul role="list" className="max-h-56 overflow-y-auto py-1">
            {planLabels.map((label) => {
              const isApplied = appliedIds.has(label.id)
              return (
                <li key={label.id}>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => void handleToggle(label)}
                    aria-pressed={isApplied}
                    aria-label={`${isApplied ? 'Remove' : 'Apply'} label ${label.name}`}
                    className="flex w-full items-center justify-start gap-2 px-3 py-1.5"
                    data-testid={`label-option-${label.id}`}
                  >
                    <span
                      className="size-2.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: label.color }}
                      aria-hidden
                    />
                    <span className="flex-1 truncate text-sm">{label.name}</span>
                    {isApplied && (
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
