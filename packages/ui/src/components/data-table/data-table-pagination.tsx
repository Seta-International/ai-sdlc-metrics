'use client'

import * as React from 'react'
import { ChevronFirstIcon, ChevronLastIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'

export interface DataTablePaginationProps {
  pageIndex: number
  pageSize: number
  totalCount: number
  onPageChange: (pageIndex: number) => void
  onPageSizeChange: (pageSize: number) => void
  className?: string
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

export function DataTablePagination({
  pageIndex,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  className,
}: DataTablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const canPrev = pageIndex > 0
  const canNext = pageIndex < totalPages - 1

  const rowStart = totalCount === 0 ? 0 : pageIndex * pageSize + 1
  const rowEnd = Math.min((pageIndex + 1) * pageSize, totalCount)

  return (
    <div
      className={cn('flex items-center justify-between gap-4 px-2 py-2 text-xs', className)}
      data-slot="data-table-pagination"
    >
      <span className="text-muted-foreground">
        {totalCount === 0 ? '0 rows' : `${rowStart}–${rowEnd} of ${totalCount} rows`}
      </span>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-muted-foreground">
          Rows per page
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-6 rounded border border-input bg-background px-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Rows per page"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onPageChange(0)}
            disabled={!canPrev}
            aria-label="First page"
          >
            <ChevronFirstIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onPageChange(pageIndex - 1)}
            disabled={!canPrev}
            aria-label="Previous page"
          >
            <ChevronLeftIcon />
          </Button>
          <span className="min-w-12 text-center text-muted-foreground">
            {pageIndex + 1} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onPageChange(pageIndex + 1)}
            disabled={!canNext}
            aria-label="Next page"
          >
            <ChevronRightIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onPageChange(totalPages - 1)}
            disabled={!canNext}
            aria-label="Last page"
          >
            <ChevronLastIcon />
          </Button>
        </div>
      </div>
    </div>
  )
}
