import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('@/lib/hooks/use-my-day', () => ({
  useMyDay: () => ({ data: [], isLoading: false, error: null }),
}))
vi.mock('../my-day-context', () => ({
  useMyDayContext: () => ({ date: '2026-04-20', timezone: 'Asia/Ho_Chi_Minh' }),
}))
vi.mock('@future/schedule', () => ({
  ScheduleCalendar: () => <div data-testid="schedule-calendar" />,
}))
vi.mock('@future/schedule/styles.css', () => ({}))

import Page from './page'

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient()
  return render(React.createElement(QueryClientProvider, { client: qc }, ui as React.ReactNode))
}

describe('MyDaySchedulePage', () => {
  it('renders the empty state when no entries', () => {
    wrap(<Page />)
    expect(screen.getByText(/nothing scheduled for today/i)).toBeInTheDocument()
  })
})
