'use client'
import { Check, EyeOff } from '@future/ui/icons'
import { Button } from '@future/ui'

export function IncludeCompletedChip({
  value,
  onChange,
}: {
  value: boolean
  onChange: (next: boolean) => void
}) {
  const Icon = value ? EyeOff : Check
  const label = value ? 'Hide completed' : 'Show completed'
  return (
    <Button variant={value ? 'default' : 'ghost'} size="sm" onClick={() => onChange(!value)}>
      <Icon className="size-4" aria-hidden={true} />
      {label}
    </Button>
  )
}
