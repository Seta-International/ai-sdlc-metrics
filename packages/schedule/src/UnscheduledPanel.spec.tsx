import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { UnscheduledPanel } from './UnscheduledPanel'

vi.mock('@fullcalendar/interaction', () => ({
  Draggable: class {
    constructor() {}
    destroy() {}
  },
}))

it('lists unscheduled items and filters by search', async () => {
  render(
    <UnscheduledPanel
      items={[
        { id: '1', title: 'Alpha', startDate: null, dueDate: null },
        { id: '2', title: 'Bravo', startDate: null, dueDate: null },
      ]}
    />,
  )
  await userEvent.type(screen.getByRole('searchbox'), 'brv')
  expect(screen.queryByText('Alpha')).toBeNull()
  expect(screen.getByText('Bravo')).toBeInTheDocument()
})

it('each item carries data-event JSON consumed by FullCalendar Draggable', () => {
  render(
    <UnscheduledPanel
      items={[{ id: '1', title: 'Alpha', startDate: null, dueDate: null, version: 'v7' }]}
    />,
  )
  const el = screen.getByTestId('unscheduled-item-1')
  const data = JSON.parse(el.getAttribute('data-event')!)
  expect(data).toMatchObject({
    title: 'Alpha',
    allDay: true,
    extendedProps: { itemId: '1', kind: 'unscheduled-drop', version: 'v7' },
  })
})

it('renders a custom item via the `renderItem` slot', () => {
  render(
    <UnscheduledPanel
      items={[{ id: '1', title: 'X', startDate: null, dueDate: null }]}
      renderItem={(it) => <span data-testid="custom">{it.title}!!</span>}
    />,
  )
  expect(screen.getByTestId('custom')).toHaveTextContent('X!!')
})
