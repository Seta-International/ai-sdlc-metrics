'use client'
import { RadioGroup, RadioGroupItem, Label } from '@future/ui'
import { useViewState } from '@/lib/hooks/useViewState'
import type { DueBucket } from '@/lib/view-state'

const DUE_OPTIONS: { value: DueBucket; label: string }[] = [
  { value: 'late', label: 'Late' },
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'this-week', label: 'This week' },
  { value: 'next-week', label: 'Next week' },
  { value: 'future', label: 'Future' },
  { value: 'none', label: 'No date' },
]

export function DueFilter({ planId }: { planId: string }) {
  const { state, patch } = useViewState({ planId })

  return (
    <RadioGroup
      value={state.filter.due ?? ''}
      onValueChange={(v) => patch({ filter: { due: v as DueBucket } })}
      className="flex flex-col gap-1"
    >
      {DUE_OPTIONS.map(({ value, label }) => (
        <div key={value} className="flex items-center gap-2">
          <RadioGroupItem value={value} id={`due-${value}`} />
          <Label htmlFor={`due-${value}`} className="cursor-pointer">
            {label}
          </Label>
        </div>
      ))}
    </RadioGroup>
  )
}
