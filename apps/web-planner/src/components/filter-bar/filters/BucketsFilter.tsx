'use client'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  Checkbox,
} from '@future/ui'
import { useViewState } from '@/lib/hooks/useViewState'
import type { PlanContext } from '../types'

export function BucketsFilter({ planId, context }: { planId: string; context: PlanContext }) {
  const { state, patch } = useViewState({ planId })

  function toggle(id: string) {
    const cur = state.filter.buckets
    const next = cur.includes(id) ? cur.filter((v) => v !== id) : [...cur, id]
    patch({ filter: { buckets: next } })
  }

  return (
    <Command>
      <CommandInput placeholder="Search buckets…" />
      <CommandList>
        <CommandEmpty>No buckets found.</CommandEmpty>
        <CommandGroup>
          {context.buckets.map((b) => (
            <CommandItem key={b.id} value={b.name} onSelect={() => toggle(b.id)}>
              <Checkbox checked={state.filter.buckets.includes(b.id)} readOnly className="mr-2" />
              {b.name}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
