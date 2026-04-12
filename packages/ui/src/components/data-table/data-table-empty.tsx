'use client'

import * as React from 'react'
import { InboxIcon } from 'lucide-react'
import { cn } from '../../lib/utils'

export interface DataTableEmptyProps {
  message?: string
  className?: string
}

export function DataTableEmpty({ message = 'No results found.', className }: DataTableEmptyProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground',
        className,
      )}
      data-slot="data-table-empty"
    >
      <InboxIcon className="size-8 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  )
}
