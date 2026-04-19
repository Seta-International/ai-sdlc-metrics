import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'

// Capture last rendered FC props
let capturedFcProps: Record<string, unknown> = {}

vi.mock('@fullcalendar/react', () => ({
  default: vi.fn((props) => {
    capturedFcProps = props
    return <div data-testid="fullcalendar" />
  }),
}))
vi.mock('@fullcalendar/daygrid', () => ({ default: 'dayGridPlugin' }))
vi.mock('@fullcalendar/interaction', () => ({
  default: 'interactionPlugin',
  Draggable: class {
    constructor() {}
    destroy() {}
  },
}))

// Mock ScheduleToolbar to avoid calendarRef issues in tests
vi.mock('./ScheduleToolbar', () => ({
  ScheduleToolbar: () => <div data-testid="schedule-toolbar" />,
}))

import { ScheduleCalendar } from './ScheduleCalendar'
import type { ScheduleItem } from './types'

const baseItem: ScheduleItem = {
  id: 'task-1',
  title: 'Task One',
  startDate: '2026-04-10T00:00Z',
  dueDate: '2026-04-12T00:00Z',
}

describe('ScheduleCalendar', () => {
  beforeEach(() => {
    capturedFcProps = null
  })

  afterEach(() => {
    cleanup()
  })

  it('renders FullCalendar with correct plugins and initialView', () => {
    render(
      <ScheduleCalendar
        items={[baseItem]}
        view="dayGridWeek"
        onViewChange={vi.fn()}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByTestId('fullcalendar')).toBeInTheDocument()
    expect(capturedFcProps.plugins).toHaveLength(2)
    expect(capturedFcProps.initialView).toBe('dayGridWeek')
  })

  it('passes only non-null events to FC (unscheduled items filtered out)', () => {
    const items: ScheduleItem[] = [
      baseItem,
      { id: 'unscheduled', title: 'No dates', startDate: null, dueDate: null },
    ]
    render(
      <ScheduleCalendar
        items={items}
        view="dayGridWeek"
        onViewChange={vi.fn()}
        onChange={vi.fn()}
      />,
    )
    expect(capturedFcProps.events).toHaveLength(1)
    expect(capturedFcProps.events[0].id).toBe('task-1')
  })

  it('eventDrop fires onChange with correct payload', () => {
    const onChange = vi.fn()
    render(
      <ScheduleCalendar
        items={[baseItem]}
        view="dayGridWeek"
        onViewChange={vi.fn()}
        onChange={onChange}
      />,
    )
    // Simulate FC eventDrop callback
    capturedFcProps.eventDrop({
      event: {
        start: new Date('2026-04-14T00:00Z'),
        end: new Date('2026-04-16T00:00Z'),
        extendedProps: { kind: 'bar', itemId: 'task-1', version: 'v1' },
      },
    })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'task-1',
        kind: 'bar',
        next: { startDate: '2026-04-14', dueDate: '2026-04-15' },
      }),
    )
  })

  it('eventResize fires onChange with kind=bar', () => {
    const onChange = vi.fn()
    render(
      <ScheduleCalendar
        items={[baseItem]}
        view="dayGridWeek"
        onViewChange={vi.fn()}
        onChange={onChange}
      />,
    )
    capturedFcProps.eventResize({
      event: {
        start: new Date('2026-04-10T00:00Z'),
        end: new Date('2026-04-15T00:00Z'),
        extendedProps: { kind: 'bar', itemId: 'task-1', version: 'v1' },
      },
    })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'bar' }))
  })

  it('external drop fires onChange with kind=unscheduled-drop', () => {
    const onChange = vi.fn()
    render(
      <ScheduleCalendar
        items={[baseItem]}
        view="dayGridWeek"
        onViewChange={vi.fn()}
        onChange={onChange}
      />,
    )
    // Simulate FC external drop callback
    const draggedEl = document.createElement('div')
    draggedEl.setAttribute(
      'data-event',
      JSON.stringify({
        extendedProps: { itemId: 'task-1', kind: 'unscheduled-drop', version: 'v1' },
      }),
    )
    capturedFcProps.drop({
      date: new Date('2026-04-20T00:00Z'),
      draggedEl,
    })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'task-1',
        kind: 'unscheduled-drop',
        next: { startDate: '2026-04-20', dueDate: '2026-04-20' },
      }),
    )
  })

  it('readOnly disables editable and droppable', () => {
    render(
      <ScheduleCalendar
        items={[baseItem]}
        view="dayGridWeek"
        onViewChange={vi.fn()}
        onChange={vi.fn()}
        readOnly
      />,
    )
    expect(capturedFcProps.editable).toBe(false)
    expect(capturedFcProps.droppable).toBe(false)
  })

  it('renders FilterFirstEmptyState when itemCount > threshold and no filter', () => {
    const manyItems = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      title: `Task ${i}`,
      startDate: null,
      dueDate: null,
    }))
    render(
      <ScheduleCalendar
        items={manyItems}
        view="dayGridWeek"
        onViewChange={vi.fn()}
        onChange={vi.fn()}
        filterFirstThreshold={5}
        hasFilterApplied={false}
      />,
    )
    // Should NOT render FullCalendar
    expect(screen.queryByTestId('fullcalendar')).toBeNull()
    // Should render empty state
    expect(screen.getByRole('button', { name: /show all/i })).toBeInTheDocument()
  })

  it('does NOT show FilterFirstEmptyState when filter is applied', () => {
    const manyItems = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      title: `Task ${i}`,
      startDate: null,
      dueDate: null,
    }))
    render(
      <ScheduleCalendar
        items={manyItems}
        view="dayGridWeek"
        onViewChange={vi.fn()}
        onChange={vi.fn()}
        filterFirstThreshold={5}
        hasFilterApplied={true}
      />,
    )
    expect(screen.getByTestId('fullcalendar')).toBeInTheDocument()
  })

  it('eventClick calls onItemClick with original item', () => {
    const onItemClick = vi.fn()
    render(
      <ScheduleCalendar
        items={[baseItem]}
        view="dayGridWeek"
        onViewChange={vi.fn()}
        onChange={vi.fn()}
        onItemClick={onItemClick}
      />,
    )
    capturedFcProps.eventClick({
      event: { extendedProps: { itemId: 'task-1' } },
    })
    expect(onItemClick).toHaveBeenCalledWith(baseItem)
  })
})
