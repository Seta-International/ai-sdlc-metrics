import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@future/api-client'
import React from 'react'

vi.mock('@/lib/hooks/use-my-day', () => ({
  useMyDay: () => ({ data: [], isLoading: false, error: null }),
}))
vi.mock('../my-day-context', () => ({
  useMyDayContext: () => ({ date: '2026-04-20', timezone: 'Asia/Ho_Chi_Minh' }),
}))
vi.mock('@future/charts', () => ({ EChart: () => <div data-testid="echart" /> }))

import Page from './page'

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient()
  return render(React.createElement(QueryClientProvider, { client: qc }, ui as React.ReactNode))
}

describe('MyDayChartsPage', () => {
  it('renders the empty state when no entries', () => {
    wrap(<Page />)
    expect(screen.getByText(/nothing scheduled for today/i)).toBeInTheDocument()
  })
})
