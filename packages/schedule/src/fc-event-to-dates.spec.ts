import { describe, expect, it } from 'vitest'
import { resolveFcChange } from './fc-event-to-dates'

describe('resolveFcChange', () => {
  it('bar shift/resize: inclusive dueDate = end - 1 day', () => {
    expect(
      resolveFcChange({
        kind: 'bar',
        newStart: new Date('2026-04-13T00:00Z'),
        newEnd: new Date('2026-04-16T00:00Z'),
      }),
    ).toEqual({ startDate: '2026-04-13', dueDate: '2026-04-15' })
  })

  it('pin shift: startDate stays null; dueDate = start day', () => {
    expect(
      resolveFcChange({
        kind: 'pin',
        newStart: new Date('2026-04-17T00:00Z'),
        newEnd: new Date('2026-04-18T00:00Z'),
      }),
    ).toEqual({ startDate: null, dueDate: '2026-04-17' })
  })

  it('unscheduled-drop: startDate = dueDate = drop day', () => {
    expect(
      resolveFcChange({
        kind: 'unscheduled-drop',
        newStart: new Date('2026-04-20T00:00Z'),
        newEnd: new Date('2026-04-21T00:00Z'),
      }),
    ).toEqual({ startDate: '2026-04-20', dueDate: '2026-04-20' })
  })
})
