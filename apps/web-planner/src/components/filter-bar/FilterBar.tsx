'use client'
import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from '@future/ui'
import { FilterChip } from './FilterChip'
import { useViewState } from '@/lib/hooks/useViewState'
import type { PlanContext } from './types'
import type { ViewState } from '@/lib/view-state'

type FilterField = 'due' | 'priority' | 'labels' | 'buckets' | 'assignees'

const FILTER_LABEL: Record<FilterField, string> = {
  due: 'Due date',
  priority: 'Priority',
  labels: 'Labels',
  buckets: 'Buckets',
  assignees: 'Assignees',
}

function computeActiveFields(filter: ViewState['filter']): FilterField[] {
  const fields: FilterField[] = []
  if (filter.due !== undefined) fields.push('due')
  if (filter.priority.length > 0) fields.push('priority')
  if (filter.labels.length > 0) fields.push('labels')
  if (filter.buckets.length > 0) fields.push('buckets')
  if (filter.assignees.length > 0) fields.push('assignees')
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
  }
}

export function FilterBar({ planId, context }: { planId: string; context: PlanContext }) {
  const { state, patch } = useViewState({ planId })
  const active = useMemo(() => computeActiveFields(state.filter), [state.filter])
  const available = (['due', 'priority', 'labels', 'buckets', 'assignees'] as FilterField[]).filter(
    (k) => !active.includes(k),
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      {active.map((field) => (
        <FilterChip key={field} planId={planId} field={field} context={context} />
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
                onSelect={() => patch({ filter: addFilterDefault(state.filter, f) })}
              >
                {FILTER_LABEL[f]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
