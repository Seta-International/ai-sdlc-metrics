'use client'

import { ToggleGroup, ToggleGroupItem } from './toggle-group'

export type TimeRangeOption<T extends string> = {
  value: T
  label: string
}

export interface TimeRangeToggleProps<T extends string> {
  value: T
  onValueChange: (value: T) => void
  options: ReadonlyArray<TimeRangeOption<T>>
  size?: 'sm' | 'default' | 'lg'
  ariaLabel?: string
  className?: string
}

export function TimeRangeToggle<T extends string>({
  value,
  onValueChange,
  options,
  size = 'sm',
  ariaLabel,
  className,
}: TimeRangeToggleProps<T>) {
  return (
    <ToggleGroup
      type="single"
      size={size}
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(next as T)
      }}
      aria-label={ariaLabel}
      className={className}
    >
      {options.map((opt) => (
        <ToggleGroupItem key={opt.value} value={opt.value}>
          {opt.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
