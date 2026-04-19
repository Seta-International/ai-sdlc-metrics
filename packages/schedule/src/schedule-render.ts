import type { ScheduleClass, ScheduleItem } from './types'

export type ClassifyOpts = { preservePinSemantics?: boolean }

export function classifyItem(item: ScheduleItem, opts: ClassifyOpts = {}): ScheduleClass {
  const preservePin = opts.preservePinSemantics ?? true
  if (item.startDate && item.dueDate) return 'bar'
  if (!item.startDate && item.dueDate) return 'pin'
  if (item.startDate && !item.dueDate) return preservePin ? 'unscheduled' : 'pin'
  return 'unscheduled'
}

export function partitionItems(
  items: ScheduleItem[],
  opts: ClassifyOpts = {},
): {
  bars: ScheduleItem[]
  pins: ScheduleItem[]
  unscheduled: ScheduleItem[]
} {
  const bars: ScheduleItem[] = []
  const pins: ScheduleItem[] = []
  const unscheduled: ScheduleItem[] = []
  for (const it of items) {
    const c = classifyItem(it, opts)
    if (c === 'bar') bars.push(it)
    else if (c === 'pin') pins.push(it)
    else unscheduled.push(it)
  }
  return { bars, pins, unscheduled }
}
