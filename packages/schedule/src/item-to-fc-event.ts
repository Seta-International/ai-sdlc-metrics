import type { EventInput } from '@fullcalendar/core'
import type { ScheduleItem } from './types'
import { classifyItem, type ClassifyOpts } from './schedule-render'

export function itemToFcEvent(item: ScheduleItem, opts: ClassifyOpts = {}): EventInput | null {
  const kind = classifyItem(item, opts)
  if (kind === 'unscheduled') return null

  // Anchor date depends on kind:
  //   bar → startDate; pin → dueDate (or startDate when preservePinSemantics=false)
  const anchorIso = kind === 'bar' ? item.startDate! : (item.dueDate ?? item.startDate!)
  const endAnchorIso = item.dueDate ?? item.startDate!

  const startIso = isoDate(anchorIso)
  const endExclusiveIso = isoDate(addDays(new Date(endAnchorIso), 1))

  const ev: EventInput = {
    id: item.id,
    title: item.title,
    start: startIso,
    end: endExclusiveIso,
    allDay: true,
    extendedProps: {
      kind,
      itemId: item.id,
      version: item.version,
      payload: item.payload,
    },
  }
  if (item.color) ev.backgroundColor = item.color
  return ev
}

function isoDate(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
}
