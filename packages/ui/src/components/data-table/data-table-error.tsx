'use client'

import * as React from 'react'
import { AlertCircleIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'

export interface DataTableErrorProps {
  message: string
  onRetry?: () => void
  className?: string
}

export function DataTableError({ message, onRetry, className }: DataTableErrorProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 py-12 text-center', className)}
      data-slot="data-table-error"
    >
      <AlertCircleIcon className="size-8 text-destructive opacity-80" />
      <p className="text-sm text-destructive">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} aria-label="Retry">
          Retry
        </Button>
      )}
    </div>
  )
}
