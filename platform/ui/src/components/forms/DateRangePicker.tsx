import * as Pop from '@radix-ui/react-popover'
import { CalendarDays } from 'lucide-react'
import { useState } from 'react'
import { Button } from './Button'
import { Input } from './Input'

export interface DateRange {
  from: string
  to: string
}

interface Props {
  value: DateRange | null
  onChange: (v: DateRange | null) => void
}

export function DateRangePicker({ value, onChange }: Props) {
  const [from, setFrom] = useState(value?.from ?? '')
  const [to, setTo] = useState(value?.to ?? '')
  return (
    <Pop.Root>
      <Pop.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-hairline-strong bg-canvas px-3 text-[14px] text-ink hover:bg-canvas-subtle"
        >
          <CalendarDays className="size-4 stroke-[1.5] text-ink-mute" />
          {value ? (
            <span className="tnum">
              {value.from} → {value.to}
            </span>
          ) : (
            'Pick dates'
          )}
        </button>
      </Pop.Trigger>
      <Pop.Portal>
        <Pop.Content
          side="bottom"
          align="start"
          sideOffset={6}
          className="z-50 w-72 rounded-md border border-hairline bg-canvas p-3 shadow-float"
        >
          <div className="space-y-2">
            <label className="text-[12px] text-ink-mute" htmlFor="from">
              From
            </label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <label className="text-[12px] text-ink-mute" htmlFor="to">
              To
            </label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
                Clear
              </Button>
              <Button size="sm" disabled={!from || !to} onClick={() => onChange({ from, to })}>
                Apply
              </Button>
            </div>
          </div>
        </Pop.Content>
      </Pop.Portal>
    </Pop.Root>
  )
}
