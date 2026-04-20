'use client'
import { X } from 'lucide-react'
import { Button } from '@future/ui'
import { FilterPopover } from './FilterPopover'
import { useViewState } from '@/lib/hooks/useViewState'
import type { ViewStateOptions } from '@/lib/hooks/useViewState'
import type { PlanContext, FilterField } from './types'
import type { ViewState } from '@/lib/view-state'

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
  viewStateOpts,
  field,
  context,
  onRemove,
}: {
  viewStateOpts: ViewStateOptions
  field: FilterField
  context: PlanContext
  onRemove?: () => void
}) {
  const { state, patch } = useViewState(viewStateOpts)

  function handleClear() {
    patch({ filter: clearFilter(field, state.filter) })
    onRemove?.()
  }

  return (
    <div className="flex items-center rounded-md border border-input shadow-sm">
      <FilterPopover viewStateOpts={viewStateOpts} field={field} context={context}>
        <Button variant="ghost" size="sm" className="rounded-r-none border-r-0 h-8">
          {chipLabel(field, state.filter)}
        </Button>
      </FilterPopover>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 rounded-l-none"
        aria-label="Clear filter"
        onClick={handleClear}
      >
        <X className="size-3" aria-hidden={true} />
      </Button>
    </div>
  )
}
