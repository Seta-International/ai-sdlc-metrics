'use client'
import type { RefObject } from 'react'
import type FullCalendar from '@fullcalendar/react'
import type { ScheduleView } from './types'

export type ScheduleToolbarProps = {
  view: ScheduleView
  onViewChange: (v: ScheduleView) => void
  calendarRef: RefObject<FullCalendar | null>
  /** Views to expose in the toggle. Defaults to ['dayGridWeek', 'dayGridMonth']. */
  views?: ScheduleView[]
}

const VIEW_LABELS: Record<ScheduleView, string> = {
  dayGridDay: 'Day',
  dayGridWeek: 'Week',
  dayGridMonth: 'Month',
  dayGridYear: 'Year',
  dayGridCustom: 'Custom',
}

export function ScheduleToolbar({
  view,
  onViewChange,
  calendarRef,
  views = ['dayGridWeek', 'dayGridMonth'],
}: ScheduleToolbarProps) {
  const nav = (fn: 'prev' | 'next' | 'today') => () => calendarRef.current?.getApi()[fn]()
  const set = (v: ScheduleView) => {
    onViewChange(v)
    calendarRef.current?.getApi().changeView(v)
  }
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={nav('prev')}
        aria-label="Previous"
        className="rounded px-2 py-1 text-sm hover:bg-muted"
      >
        ‹
      </button>
      <button
        onClick={nav('today')}
        aria-label="Today"
        className="rounded px-2 py-1 text-sm hover:bg-muted"
      >
        Today
      </button>
      <button
        onClick={nav('next')}
        aria-label="Next"
        className="rounded px-2 py-1 text-sm hover:bg-muted"
      >
        ›
      </button>
      <div role="tablist" className="ml-2 flex rounded border border-border">
        {views.map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => set(v)}
            className={`px-3 py-1 text-sm ${view === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>
    </div>
  )
}
