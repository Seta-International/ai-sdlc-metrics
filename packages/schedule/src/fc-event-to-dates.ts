import type { DragKind, DragResolution } from './types'

export function resolveFcChange({
  kind,
  newStart,
  newEnd,
}: {
  kind: DragKind
  newStart: Date
  newEnd: Date
}): DragResolution {
  const startDay = isoDate(newStart)
  const dueDay = isoDate(addDays(newEnd, -1)) // FC end exclusive → inclusive

  switch (kind) {
    case 'bar':
      return { startDate: startDay, dueDate: dueDay }
    case 'pin':
      return { startDate: null, dueDate: startDay }
    case 'unscheduled-drop':
      return { startDate: startDay, dueDate: startDay }
  }
}

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
}
