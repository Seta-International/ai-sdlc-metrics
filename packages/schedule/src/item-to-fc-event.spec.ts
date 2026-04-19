import { describe, expect, it } from 'vitest'
import { itemToFcEvent } from './item-to-fc-event'

describe('itemToFcEvent', () => {
  it('bar: exclusive end is dueDate + 1 day (all-day)', () => {
    const ev = itemToFcEvent({
      id: '1',
      title: 'A',
      startDate: '2026-04-10T00:00Z',
      dueDate: '2026-04-12T00:00Z',
    })
    expect(ev).toMatchObject({
      id: '1',
      title: 'A',
      start: '2026-04-10',
      end: '2026-04-13',
      allDay: true,
      extendedProps: { kind: 'bar' },
    })
  })

  it('pin: single all-day event on the due date', () => {
    const ev = itemToFcEvent({ id: '2', title: 'B', startDate: null, dueDate: '2026-04-15T00:00Z' })
    expect(ev).toMatchObject({
      start: '2026-04-15',
      end: '2026-04-16',
      extendedProps: { kind: 'pin' },
    })
  })

  it('unscheduled → null', () => {
    expect(itemToFcEvent({ id: '3', title: 'C', startDate: null, dueDate: null })).toBeNull()
  })

  it('copies color into backgroundColor; omits when absent', () => {
    const withColor = itemToFcEvent({
      id: '4',
      title: 'D',
      startDate: null,
      dueDate: '2026-04-20T00:00Z',
      color: 'var(--x)',
    })
    expect(withColor?.backgroundColor).toBe('var(--x)')
    const withoutColor = itemToFcEvent({
      id: '5',
      title: 'E',
      startDate: null,
      dueDate: '2026-04-20T00:00Z',
    })
    expect(withoutColor?.backgroundColor).toBeUndefined()
  })

  it('ferries version + payload through extendedProps', () => {
    const ev = itemToFcEvent({
      id: '6',
      title: 'F',
      startDate: null,
      dueDate: '2026-04-20T00:00Z',
      version: 'v1',
      payload: { foo: 42 },
    })
    expect(ev?.extendedProps).toMatchObject({ version: 'v1', payload: { foo: 42 } })
  })

  it('honors preservePinSemantics=false: start-only becomes a pin on the start date', () => {
    const ev = itemToFcEvent(
      { id: '7', title: 'G', startDate: '2026-04-20T00:00Z', dueDate: null },
      { preservePinSemantics: false },
    )
    expect(ev).toMatchObject({
      start: '2026-04-20',
      end: '2026-04-21',
      extendedProps: { kind: 'pin' },
    })
  })
})
