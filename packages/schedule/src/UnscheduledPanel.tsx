'use client'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Draggable } from '@fullcalendar/interaction'
import type { ScheduleItem } from './types'

export type UnscheduledPanelProps<TPayload = unknown> = {
  items: ScheduleItem<TPayload>[]
  title?: string
  emptyLabel?: string
  /** Slot for host apps to render a custom item (e.g., planner renders title + priority + label pills). */
  renderItem?: (item: ScheduleItem<TPayload>) => ReactNode
  /** Called when the search input changes, for host-side analytics. Optional. */
  onSearchChange?: (q: string) => void
}

export function UnscheduledPanel<TPayload = unknown>({
  items,
  title = 'Unscheduled',
  emptyLabel = 'No items',
  renderItem,
  onSearchChange,
}: UnscheduledPanelProps<TPayload>) {
  const containerRef = useRef<HTMLUListElement | null>(null)
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    if (!search) return items
    const q = search.toLowerCase()
    return items.filter((it) => {
      const text = it.title.toLowerCase()
      // Fuzzy: every character of the query must appear in order in the title
      let qi = 0
      for (let ti = 0; ti < text.length && qi < q.length; ti++) {
        if (text[ti] === q[qi]) qi++
      }
      return qi === q.length
    })
  }, [items, search])

  useEffect(() => {
    if (!containerRef.current) return
    const draggable = new Draggable(containerRef.current, {
      itemSelector: '[data-event]',
      eventData: (el) => JSON.parse(el.getAttribute('data-event') ?? '{}'),
    })
    return () => draggable.destroy()
  }, [])

  return (
    <aside className="fcx-unscheduled flex w-72 flex-col border-l border-border">
      <header className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{filtered.length}</span>
      </header>
      <div className="px-4 pb-2">
        <input
          role="searchbox"
          type="search"
          placeholder="Search…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            onSearchChange?.(e.target.value)
          }}
          className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
        />
      </div>
      <ul ref={containerRef} className="flex-1 space-y-1 overflow-auto px-4 pb-4">
        {filtered.length === 0 && <li className="text-xs text-muted-foreground">{emptyLabel}</li>}
        {filtered.map((it) => (
          <li
            key={it.id}
            data-testid={`unscheduled-item-${it.id}`}
            data-event={JSON.stringify({
              title: it.title,
              allDay: true,
              duration: { days: 1 },
              extendedProps: {
                itemId: it.id,
                kind: 'unscheduled-drop',
                version: it.version,
                payload: it.payload,
              },
            })}
            className="cursor-grab rounded border border-border bg-background px-2 py-1.5 text-sm hover:bg-muted"
          >
            {renderItem ? renderItem(it) : it.title}
          </li>
        ))}
      </ul>
    </aside>
  )
}
