'use client'

import * as React from 'react'
import { SlidersHorizontalIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'

export interface ColumnOption {
  id: string
  label: string
}

export interface DataTableViewOptionsProps {
  columns: ColumnOption[]
  visibility: Record<string, boolean>
  onVisibilityChange: (visibility: Record<string, boolean>) => void
  className?: string
}

export function DataTableViewOptions({
  columns,
  visibility,
  onVisibilityChange,
  className,
}: DataTableViewOptionsProps) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  // Close on outside click
  React.useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function toggle(columnId: string) {
    const current = visibility[columnId] !== false // default visible
    onVisibilityChange({ ...visibility, [columnId]: !current })
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        aria-label="View options"
        aria-expanded={open}
      >
        <SlidersHorizontalIcon className="size-3.5" />
        View
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-40 rounded-md border border-border bg-popover p-1 shadow-md">
          <p className="px-2 py-1 text-tiny font-590 uppercase tracking-table-head text-muted-foreground">
            Toggle columns
          </p>
          {columns.map((col) => {
            const isVisible = visibility[col.id] !== false
            return (
              <label
                key={col.id}
                className="flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1 text-xs hover:bg-accent"
              >
                <input
                  type="checkbox"
                  checked={isVisible}
                  onChange={() => toggle(col.id)}
                  className="size-3.5 accent-primary"
                  aria-label={`Toggle ${col.label} column`}
                />
                {col.label}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
