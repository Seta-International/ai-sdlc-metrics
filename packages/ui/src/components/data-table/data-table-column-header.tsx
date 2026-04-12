'use client'

import * as React from 'react'
import { ArrowUpIcon, ArrowDownIcon, ArrowUpDownIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'

export interface DataTableColumnHeaderProps {
  label: React.ReactNode
  /** Plain text label for accessibility (aria-label on the sort button) */
  ariaLabel?: string
  columnId: string
  /** Current sort direction for this column, undefined = unsorted */
  sortDirection?: 'asc' | 'desc'
  enableSorting?: boolean
  onSort?: (columnId: string, next: 'asc' | 'desc' | null) => void
  className?: string
}

export function DataTableColumnHeader({
  label,
  ariaLabel,
  columnId,
  sortDirection,
  enableSorting,
  onSort,
  className,
}: DataTableColumnHeaderProps) {
  if (!enableSorting || !onSort) {
    return <span className={className}>{label}</span>
  }

  function handleClick() {
    if (!onSort) return
    if (sortDirection === undefined) {
      onSort(columnId, 'asc')
    } else if (sortDirection === 'asc') {
      onSort(columnId, 'desc')
    } else {
      onSort(columnId, null)
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('-ml-2 h-7 gap-1 data-[state=open]:bg-accent', className)}
      onClick={handleClick}
      aria-label={ariaLabel}
    >
      {label}
      {sortDirection === 'asc' ? (
        <ArrowUpIcon className="size-3.5" />
      ) : sortDirection === 'desc' ? (
        <ArrowDownIcon className="size-3.5" />
      ) : (
        <ArrowUpDownIcon className="size-3.5 opacity-50" />
      )}
    </Button>
  )
}
