'use client'

import * as React from 'react'
import { SearchIcon } from 'lucide-react'
import { cn } from '../../lib/utils'

export interface DataTableSearchProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function DataTableSearch({
  value,
  onChange,
  placeholder = 'Search…',
  className,
}: DataTableSearchProps) {
  const [localValue, setLocalValue] = React.useState(value)

  // Sync external value if it changes (e.g. reset)
  React.useEffect(() => {
    setLocalValue(value)
  }, [value])

  // 300ms debounce
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (localValue !== value) {
        onChange(localValue)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [localValue, onChange, value])

  return (
    <div className={cn('relative flex items-center', className)}>
      <SearchIcon className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
      <input
        type="search"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={placeholder}
        className="h-7 w-48 rounded-md border border-input bg-background pl-8 pr-3 text-xs shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Search"
      />
    </div>
  )
}
