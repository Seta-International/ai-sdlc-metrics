'use client'
import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from '@future/ui'
import { FilterChip } from './FilterChip'
import { IncludeCompletedChip } from './filters/IncludeCompletedChip'
import { useViewState } from '@/lib/hooks/useViewState'
import type { PlanContext, FilterField, FilterMode } from './types'
import type { ViewState } from '@/lib/view-state'

const FILTER_LABEL: Record<FilterField, string> = {
  due: 'Due date',
  priority: 'Priority',
  labels: 'Labels',
  buckets: 'Buckets',
  assignees: 'Assignees',
  includeCompleted: 'Include completed',
}

function computeActiveFields(filter: ViewState['filter'], pinned: Set<FilterField>): FilterField[] {
  const fields: FilterField[] = []
  if (filter.due !== undefined) fields.push('due')
  if (filter.priority.length > 0) fields.push('priority')
  if (filter.labels.length > 0 || pinned.has('labels')) fields.push('labels')
  if (filter.buckets.length > 0 || pinned.has('buckets')) fields.push('buckets')
  if (filter.assignees.length > 0 || pinned.has('assignees')) fields.push('assignees')
  return fields
}

function addFilterDefault(filter: ViewState['filter'], field: FilterField): ViewState['filter'] {
  switch (field) {
    case 'due':
      return { ...filter, due: 'today' }
    case 'priority':
      return { ...filter, priority: ['urgent'] }
    case 'labels':
      return { ...filter, labels: [] }
    case 'buckets':
      return { ...filter, buckets: [] }
    case 'assignees':
      return { ...filter, assignees: [] }
    case 'includeCompleted':
      return filter
  }
}

export function FilterBar({
  planId,
  context,
  mode = 'plan',
  includeCompleted,
  onIncludeCompletedChange,
}: {
  planId?: string
  context: PlanContext
  mode?: FilterMode
  includeCompleted?: boolean
  onIncludeCompletedChange?: (next: boolean) => void
}) {
  const stateOpts = planId ? { planId } : { scope: 'personal' as const }
  const { state, patch } = useViewState(stateOpts)
  const [pinned, setPinned] = useState<Set<FilterField>>(() => new Set())
  const active = useMemo(() => computeActiveFields(state.filter, pinned), [state.filter, pinned])
  const available = (['due', 'priority', 'labels', 'buckets', 'assignees'] as FilterField[]).filter(
    (k) => !active.includes(k),
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      {active.map((field) => (
        <FilterChip
          key={field}
          planId={planId ?? ''}
          field={field}
          context={context}
          onRemove={() =>
            setPinned((p) => {
              const n = new Set(p)
              n.delete(field)
              return n
            })
          }
        />
      ))}
      {available.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <Plus className="size-4" aria-hidden={true} />
              Add filter
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {available.map((f) => (
              <DropdownMenuItem
                key={f}
                onSelect={() => {
                  setPinned((p) => {
                    const n = new Set(p)
                    n.add(f)
                    return n
                  })
                  patch({ filter: addFilterDefault(state.filter, f) })
                }}
              >
                {FILTER_LABEL[f]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {mode === 'personal' && onIncludeCompletedChange != null ? (
        <IncludeCompletedChip
          value={includeCompleted ?? false}
          onChange={onIncludeCompletedChange}
        />
      ) : null}
    </div>
  )
}
