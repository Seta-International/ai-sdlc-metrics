'use client'
import { X } from 'lucide-react'
import { Button } from '@future/ui'
import { FilterPopover } from './FilterPopover'
import { useViewState } from '@/lib/hooks/useViewState'
import type { PlanContext } from './types'
import type { ViewState } from '@/lib/view-state'

type FilterField = 'due' | 'priority' | 'labels' | 'buckets' | 'assignees'

function chipLabel(field: FilterField, filter: ViewState['filter']): string {
  switch (field) {
    case 'due':
      return `Due: ${filter.due ?? ''}`
    case 'priority':
      return `Priority: ${filter.priority.join(', ')}`
    case 'labels':
      return `Labels${filter.labels.length > 0 ? ` (${filter.labels.length})` : ''}`
    case 'buckets':
      return `Buckets${filter.buckets.length > 0 ? ` (${filter.buckets.length})` : ''}`
    case 'assignees':
      return `Assignees${filter.assignees.length > 0 ? ` (${filter.assignees.length})` : ''}`
  }
}

function clearFilter(field: FilterField, filter: ViewState['filter']): ViewState['filter'] {
  switch (field) {
    case 'due':
      return { ...filter, due: undefined }
    case 'priority':
      return { ...filter, priority: [] }
    case 'labels':
      return { ...filter, labels: [] }
    case 'buckets':
      return { ...filter, buckets: [] }
    case 'assignees':
      return { ...filter, assignees: [] }
  }
}

export function FilterChip({
  planId,
  field,
  context,
}: {
  planId: string
  field: FilterField
  context: PlanContext
}) {
  const { state, patch } = useViewState({ planId })

  return (
    <FilterPopover
      planId={planId}
      field={field}
      context={context}
      trigger={
        <Button variant="outline" size="sm" className="gap-1">
          {chipLabel(field, state.filter)}
          <span
            role="button"
            aria-label="Clear filter"
            className="ml-1 rounded hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation()
              patch({ filter: clearFilter(field, state.filter) })
            }}
          >
            <X className="size-3" aria-hidden={true} />
          </span>
        </Button>
      }
    />
  )
}
