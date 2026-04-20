'use client'
import { Checkbox, Label } from '@future/ui'
import { useViewState } from '@/lib/hooks/useViewState'
import type { ViewStateOptions } from '@/lib/hooks/useViewState'
import type { Priority } from '@/lib/view-state'

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'important', label: 'Important' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

export function PriorityFilter({ viewStateOpts }: { viewStateOpts: ViewStateOptions }) {
  const { state, patch } = useViewState(viewStateOpts)

  function toggle(value: Priority) {
    const cur = state.filter.priority
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
    patch({ filter: { priority: next } })
  }

  return (
    <div className="flex flex-col gap-1">
      {PRIORITY_OPTIONS.map(({ value, label }) => (
        <div key={value} className="flex items-center gap-2">
          <Checkbox
            id={`priority-${value}`}
            checked={state.filter.priority.includes(value)}
            onCheckedChange={() => toggle(value)}
          />
          <Label htmlFor={`priority-${value}`} className="cursor-pointer">
            {label}
          </Label>
        </div>
      ))}
    </div>
  )
}
