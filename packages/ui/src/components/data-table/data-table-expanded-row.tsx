'use client'

import * as React from 'react'
import { cn } from '../../lib/utils'

export interface DataTableExpandedRowProps {
  children: React.ReactNode
  className?: string
}

export function DataTableExpandedRow({ children, className }: DataTableExpandedRowProps) {
  return (
    <div
      className={cn('border-b border-border bg-muted/30 px-4 py-3', className)}
      data-slot="data-table-expanded-row"
    >
      {children}
    </div>
  )
}
