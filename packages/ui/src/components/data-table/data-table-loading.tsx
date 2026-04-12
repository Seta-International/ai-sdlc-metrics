'use client'

import * as React from 'react'
import { cn } from '../../lib/utils'

export interface DataTableLoadingProps {
  rows?: number
  columns?: number
  className?: string
}

export function DataTableLoading({ rows = 5, columns = 4, className }: DataTableLoadingProps) {
  return (
    <div
      className={cn('w-full space-y-0', className)}
      data-slot="data-table-loading"
      aria-label="Loading"
    >
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          // eslint-disable-next-line react/no-array-index-key
          key={rowIdx}
          className="flex gap-3 border-b border-border px-3 py-2.5"
        >
          {Array.from({ length: columns }).map((__, colIdx) => (
            <div
              // eslint-disable-next-line react/no-array-index-key
              key={colIdx}
              className="h-4 flex-1 animate-pulse rounded bg-muted"
              style={{ animationDelay: `${(rowIdx * columns + colIdx) * 40}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
