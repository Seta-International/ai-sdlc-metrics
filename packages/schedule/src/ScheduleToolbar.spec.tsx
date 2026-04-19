import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import type FullCalendar from '@fullcalendar/react'
import { ScheduleToolbar } from './ScheduleToolbar'
import type { ScheduleView } from './types'

// Mock FullCalendar API
function makeMockRef() {
  const mockPrev = vi.fn()
  const mockNext = vi.fn()
  const mockToday = vi.fn()
  const mockChangeView = vi.fn()

  const ref: React.RefObject<FullCalendar> = {
    current: {
      getApi: () => ({
        prev: mockPrev,
        next: mockNext,
        today: mockToday,
        changeView: mockChangeView,
      }),
    } as any,
  }
  return { ref, mockPrev, mockNext, mockToday, mockChangeView }
}

describe('ScheduleToolbar', () => {
  afterEach(() => {
    cleanup()
  })

  it('calls onViewChange when a view tab is clicked', async () => {
    const onViewChange = vi.fn()
    const { ref, mockChangeView } = makeMockRef()
    render(<ScheduleToolbar view="dayGridWeek" onViewChange={onViewChange} calendarRef={ref} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Month' }))
    expect(onViewChange).toHaveBeenCalledWith('dayGridMonth')
    expect(mockChangeView).toHaveBeenCalledWith('dayGridMonth')
  })

  it('calls prev on calendarRef when Previous button is clicked', async () => {
    const { ref, mockPrev } = makeMockRef()
    render(<ScheduleToolbar view="dayGridWeek" onViewChange={vi.fn()} calendarRef={ref} />)
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(mockPrev).toHaveBeenCalled()
  })

  it('calls next on calendarRef when Next button is clicked', async () => {
    const { ref, mockNext } = makeMockRef()
    render(<ScheduleToolbar view="dayGridWeek" onViewChange={vi.fn()} calendarRef={ref} />)
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(mockNext).toHaveBeenCalled()
  })

  it('calls today on calendarRef when Today button is clicked', async () => {
    const { ref, mockToday } = makeMockRef()
    render(<ScheduleToolbar view="dayGridWeek" onViewChange={vi.fn()} calendarRef={ref} />)
    await userEvent.click(screen.getByRole('button', { name: /today/i }))
    expect(mockToday).toHaveBeenCalled()
  })

  it('active view tab has aria-selected=true', () => {
    render(
      <ScheduleToolbar
        view="dayGridMonth"
        onViewChange={vi.fn()}
        calendarRef={{ current: null } as any}
      />,
    )
    expect(screen.getByRole('tab', { name: 'Month' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Week' })).toHaveAttribute('aria-selected', 'false')
  })

  it('inactive view tab has aria-selected=false', () => {
    render(
      <ScheduleToolbar
        view="dayGridWeek"
        onViewChange={vi.fn()}
        calendarRef={{ current: null } as any}
      />,
    )
    expect(screen.getByRole('tab', { name: 'Week' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Month' })).toHaveAttribute('aria-selected', 'false')
  })

  it('respects custom views prop', () => {
    render(
      <ScheduleToolbar
        view="dayGridMonth"
        onViewChange={vi.fn()}
        calendarRef={{ current: null } as any}
        views={['dayGridDay', 'dayGridMonth']}
      />,
    )
    expect(screen.getByRole('tab', { name: 'Day' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Month' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Week' })).not.toBeInTheDocument()
  })
})
