import * as React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import type { ColumnDef } from '@tanstack/react-table'

// Hoist mocks so they are available before vi.mock factories run
const { mockListCasesQuery } = vi.hoisted(() => ({
  mockListCasesQuery: vi.fn().mockResolvedValue({ cases: [], totalCount: 0 }),
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
}))

// Mock trpc with a deep stub for the onboarding path
vi.mock('../../lib/trpc', () => ({
  trpc: {
    people: {
      onboarding: {
        listCases: {
          query: mockListCasesQuery,
        },
      },
    },
  },
}))

// Capture columns passed to DataTable so we can assert on them
let capturedColumns: ColumnDef<unknown>[] = []

// Mock @future/ui with simple passthrough components
vi.mock('@future/ui', () => {
  const defaultTableState = {
    search: '',
    filters: [],
    sorting: [],
    pagination: { pageIndex: 0, pageSize: 20 },
    columnVisibility: {},
    columnPinning: {},
    density: 'default',
  }

  function DataTable({
    columns,
    isLoading,
  }: {
    columns: ColumnDef<unknown>[]
    rows: unknown[]
    isLoading?: boolean
    state?: unknown
    totalCount?: number
    onStateChange?: (s: unknown) => void
    onRowClick?: (row: unknown) => void
  }) {
    capturedColumns = columns
    if (isLoading) return <div data-testid="data-table-loading">Loading...</div>
    return (
      <div data-testid="data-table">
        <table>
          <thead>
            <tr>
              {columns.map((col) => {
                const key =
                  'id' in col ? col.id : 'accessorKey' in col ? String(col.accessorKey) : ''
                const header = typeof col.header === 'string' ? col.header : key
                return <th key={key}>{header}</th>
              })}
            </tr>
          </thead>
        </table>
      </div>
    )
  }

  function Badge({ children, variant }: { children: React.ReactNode; variant?: string }) {
    return (
      <span data-testid="badge" data-variant={variant}>
        {children}
      </span>
    )
  }

  function Progress({ value }: { value: number; className?: string }) {
    return <div data-testid="progress" data-value={value} />
  }

  return { DataTable, Badge, Progress, defaultTableState }
})

// Mock avatar-name-cell
vi.mock('../AvatarNameCell', () => ({
  AvatarNameCell: ({
    fullName,
    subtitle,
  }: {
    fullName: string
    avatarUrl?: string | null
    subtitle?: string | null
  }) => (
    <div data-testid="avatar-name-cell">
      <span>{fullName}</span>
      {subtitle && <span>{subtitle}</span>}
    </div>
  ),
}))

import { WorkflowCasesTable } from './WorkflowCasesTable'

describe('WorkflowCasesTable (onboarding)', () => {
  beforeEach(() => {
    capturedColumns = []
    mockListCasesQuery.mockResolvedValue({ cases: [], totalCount: 0 })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders without crashing (smoke test)', async () => {
    const { container } = render(<WorkflowCasesTable type="onboarding" />)
    expect(container).toBeTruthy()
    await act(async () => {
      await Promise.resolve()
    })
  })

  it('renders DataTable in loading state initially', () => {
    render(<WorkflowCasesTable type="onboarding" />)
    expect(screen.getByTestId('data-table-loading')).toBeInTheDocument()
  })

  it('passes correct column headers to DataTable', async () => {
    await act(async () => {
      render(<WorkflowCasesTable type="onboarding" />)
      await Promise.resolve()
    })

    const headers = capturedColumns.map((col) => (typeof col.header === 'string' ? col.header : ''))
    expect(headers).toContain('Employee')
    expect(headers).toContain('Template')
    expect(headers).toContain('Start Date')
    expect(headers).toContain('Progress')
    expect(headers).toContain('Status')
  })

  it('passes 5 columns to DataTable', async () => {
    await act(async () => {
      render(<WorkflowCasesTable type="onboarding" />)
      await Promise.resolve()
    })
    expect(capturedColumns).toHaveLength(5)
  })
})
