'use client'

import * as React from 'react'
import { XIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { TableFilter } from './table-state'

export interface DataTableFiltersProps {
  filters: TableFilter[]
  onRemoveFilter: (field: string) => void
  className?: string
}

function formatFilterLabel(filter: TableFilter): string {
  const value = Array.isArray(filter.value) ? filter.value.join(', ') : String(filter.value ?? '')
  return `${filter.field}: ${value}`
}

export function DataTableFilters({ filters, onRemoveFilter, className }: DataTableFiltersProps) {
  if (filters.length === 0) return null

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {filters.map((filter) => (
        <span
          key={filter.field}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-accent px-2 py-0.5 text-micro font-510 text-accent-foreground"
        >
          {formatFilterLabel(filter)}
          <button
            type="button"
            onClick={() => onRemoveFilter(filter.field)}
            className="ml-0.5 rounded-full hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label={`Remove filter ${filter.field}`}
          >
            <XIcon className="size-3" />
          </button>
        </span>
      ))}
    </div>
  )
}
