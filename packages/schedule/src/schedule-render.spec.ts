import { describe, expect, it } from 'vitest'
import { classifyItem, partitionItems } from './schedule-render'
import type { ScheduleItem } from './types'

const mk = (p: Partial<ScheduleItem>): ScheduleItem => ({
  id: 'x',
  title: 'x',
  startDate: null,
  dueDate: null,
  ...p,
})

describe('classifyItem (MS-planner preservePinSemantics=true, default)', () => {
  it.each([
    [{ startDate: '2026-04-10T00:00Z', dueDate: '2026-04-12T00:00Z' }, 'bar'],
    [{ startDate: null, dueDate: '2026-04-12T00:00Z' }, 'pin'],
    [{ startDate: '2026-04-10T00:00Z', dueDate: null }, 'unscheduled'],
    [{ startDate: null, dueDate: null }, 'unscheduled'],
  ])('classifies %o → %s', (partial, expected) => {
    expect(classifyItem(mk(partial))).toBe(expected)
  })
})

describe('classifyItem with preservePinSemantics=false', () => {
  it('start-only task renders as a 1-day pin on the start date (no MS-parity)', () => {
    expect(
      classifyItem(mk({ startDate: '2026-04-10T00:00Z' }), { preservePinSemantics: false }),
    ).toBe('pin')
  })
})

describe('partitionItems', () => {
  it('splits into bars / pins / unscheduled', () => {
    const out = partitionItems([
      mk({ id: '1', startDate: '2026-04-10T00:00Z', dueDate: '2026-04-12T00:00Z' }),
      mk({ id: '2', dueDate: '2026-04-15T00:00Z' }),
      mk({ id: '3' }),
    ])
    expect(out.bars.map((x) => x.id)).toEqual(['1'])
    expect(out.pins.map((x) => x.id)).toEqual(['2'])
    expect(out.unscheduled.map((x) => x.id)).toEqual(['3'])
  })
})
