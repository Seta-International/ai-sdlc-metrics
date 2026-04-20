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
import type { ViewStateOptions } from '@/lib/hooks/useViewState'
import type { PlanContext } from '../types'

export function LabelsFilter({
  viewStateOpts,
  context,
}: {
  viewStateOpts: ViewStateOptions
  context: PlanContext
}) {
  const { state, patch } = useViewState(viewStateOpts)

  function toggle(id: string) {
    const cur = state.filter.labels
    const next = cur.includes(id) ? cur.filter((v) => v !== id) : [...cur, id]
    patch({ filter: { labels: next } })
  }

  return (
    <Command>
      <CommandInput placeholder="Search labels…" />
      <CommandList>
        <CommandEmpty>No labels found.</CommandEmpty>
        <CommandGroup>
          {context.labels.map((l) => (
            <CommandItem key={l.id} value={l.name} onSelect={() => toggle(l.id)}>
              <Checkbox checked={state.filter.labels.includes(l.id)} className="mr-2" />
              {l.name}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
