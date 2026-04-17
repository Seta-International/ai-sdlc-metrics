'use client'

import * as React from 'react'
import { XIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'

export interface DataTableBulkActionsProps {
  selectedCount: number
  children?: React.ReactNode
  onClearSelection: () => void
  className?: string
}

export function DataTableBulkActions({
  selectedCount,
  children,
  onClearSelection,
  className,
}: DataTableBulkActionsProps) {
  if (selectedCount === 0) return null

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border border-border bg-accent px-3 py-1.5',
        className,
      )}
      data-slot="data-table-bulk-actions"
    >
      <span className="text-xs font-510 text-accent-foreground">{selectedCount} selected</span>
      {children}
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onClearSelection}
        aria-label="Clear selection"
        className="ml-1"
      >
        <XIcon />
      </Button>
    </div>
  )
}
