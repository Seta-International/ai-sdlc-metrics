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

export function AssigneesFilter({
  viewStateOpts,
  context,
}: {
  viewStateOpts: ViewStateOptions
  context: PlanContext
}) {
  const { state, patch } = useViewState(viewStateOpts)

  function toggle(actorId: string) {
    const cur = state.filter.assignees
    const next = cur.includes(actorId) ? cur.filter((v) => v !== actorId) : [...cur, actorId]
    patch({ filter: { assignees: next } })
  }

  return (
    <Command>
      <CommandInput placeholder="Search assignees…" />
      <CommandList>
        <CommandEmpty>No assignees found.</CommandEmpty>
        <CommandGroup>
          {context.members.map((m) => (
            <CommandItem
              key={m.actorId}
              value={m.name ?? m.actorId}
              onSelect={() => toggle(m.actorId)}
            >
              <Checkbox checked={state.filter.assignees.includes(m.actorId)} className="mr-2" />
              {m.name ?? m.actorId}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
