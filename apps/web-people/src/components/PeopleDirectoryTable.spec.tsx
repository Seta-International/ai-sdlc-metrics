import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as React from 'react'
import { render, screen, cleanup } from '@testing-library/react'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock table-url-state utilities
vi.mock('../lib/table-url-state', () => ({
  getTableStateFromUrl: () => ({
    search: '',
    filters: [],
    sorting: [],
    pagination: { pageIndex: 0, pageSize: 20 },
    columnVisibility: {},
    columnPinning: {},
    density: 'default',
  }),
  pushTableStateToUrl: vi.fn(),
  replaceTableStateInUrl: vi.fn(),
  resolveHydratedTableState: vi.fn(),
}))

// Mock trpc with a proxy that returns empty results for any deep access
const mockListQuery = vi.fn().mockResolvedValue({
  rows: [],
  totalCount: 0,
  facets: { departments: [], jobFamilies: [], countries: [], locations: [] },
})

function makeDeepProxy(): object {
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === 'query' || prop === 'mutate') return mockListQuery
        return makeDeepProxy()
      },
    },
  )
}

vi.mock('../lib/trpc', () => ({
  trpc: makeDeepProxy(),
}))

// Mock child components to avoid deep rendering
vi.mock('./avatar-name-cell', () => ({
  AvatarNameCell: ({ fullName }: { fullName: string }) =>
    React.createElement('span', null, fullName),
}))

vi.mock('./status-badge', () => ({
  StatusBadge: ({ status }: { status: string }) => React.createElement('span', null, status),
}))

vi.mock('./filter-panel', () => ({
  FilterPanel: () => React.createElement('button', { type: 'button' }, 'Filters'),
  emptyFilters: {
    departments: [],
    jobFamilies: [],
    countries: [],
    locations: [],
    employmentStatuses: [],
  },
}))

vi.mock('./card-grid-view', () => ({
  CardGridView: () => React.createElement('div', { 'data-testid': 'card-grid-view' }),
}))

// Mock @future/ui DataTable to avoid complex rendering internals
vi.mock('@future/ui', async () => {
  const actual = await vi.importActual<typeof import('@future/ui')>('@future/ui')
  return {
    ...actual,
    DataTable: ({ isLoading }: { isLoading?: boolean }) =>
      React.createElement(
        'div',
        { 'data-testid': 'data-table' },
        isLoading ? 'Loading...' : 'Table',
      ),
    Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
      React.createElement('button', { type: 'button', onClick }, children),
  }
})

import { PeopleDirectoryTable } from './PeopleDirectoryTable'

describe('PeopleDirectoryTable', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { search: '', pathname: '/' },
      writable: true,
    })
    mockListQuery.mockResolvedValue({
      rows: [],
      totalCount: 0,
      facets: { departments: [], jobFamilies: [], countries: [], locations: [] },
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders without crashing', () => {
    render(React.createElement(PeopleDirectoryTable, { resourceKey: 'people.directory' }))
    expect(screen.getByTestId('data-table')).toBeTruthy()
  })

  it('renders view toggle buttons (list and card)', () => {
    render(React.createElement(PeopleDirectoryTable, { resourceKey: 'people.directory' }))
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(2)
  })

  it('renders FilterPanel (Filters button is visible)', () => {
    render(React.createElement(PeopleDirectoryTable, { resourceKey: 'people.directory' }))
    expect(screen.getByText('Filters')).toBeTruthy()
  })

  it('renders Export button', () => {
    render(React.createElement(PeopleDirectoryTable, { resourceKey: 'people.directory' }))
    expect(screen.getByText('Export')).toBeTruthy()
  })
})
