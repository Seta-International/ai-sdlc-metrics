import * as React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import type { ColumnDef } from '@tanstack/react-table'

// Hoist mocks so they are available before vi.mock factories run
const { mockListQuery } = vi.hoisted(() => ({
  mockListQuery: vi.fn().mockResolvedValue({
    requests: [],
    totalCount: 0,
    stats: { pending: 0, approvedToday: 0, rejectedToday: 0, oldestDays: 0 },
  }),
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}))

// Mock trpc with a deep stub for the changeRequests path
vi.mock('../../lib/trpc', () => ({
  trpc: {
    people: {
      changeRequests: {
        list: {
          query: mockListQuery,
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

  function Button({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string
    size?: string
    asChild?: boolean
  }) {
    return <button {...props}>{children}</button>
  }

  function Card({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
      <div data-testid="stats-card" className={className}>
        {children}
      </div>
    )
  }

  function AlertDialog({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>
  }

  function AlertDialogTrigger({
    children,
    asChild,
  }: {
    children: React.ReactNode
    asChild?: boolean
  }) {
    return <div>{children}</div>
  }

  function AlertDialogContent({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>
  }

  function AlertDialogHeader({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>
  }

  function AlertDialogTitle({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>
  }

  function AlertDialogDescription({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>
  }

  function AlertDialogFooter({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>
  }

  function AlertDialogAction({ children }: { children: React.ReactNode }) {
    return <button>{children}</button>
  }

  function AlertDialogCancel({ children }: { children: React.ReactNode }) {
    return <button>{children}</button>
  }

  function Tabs({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode
    value?: string
    onValueChange?: (v: string) => void
  }) {
    return (
      <div data-testid="tabs" data-value={value}>
        {children}
      </div>
    )
  }

  function TabsList({ children }: { children: React.ReactNode }) {
    return <div data-testid="tabs-list">{children}</div>
  }

  function TabsTrigger({ children, value }: { children: React.ReactNode; value: string }) {
    return <button data-testid={`tab-${value}`}>{children}</button>
  }

  function TabsContent({ children }: { children: React.ReactNode; value?: string }) {
    return <div>{children}</div>
  }

  return {
    DataTable,
    Badge,
    Button,
    Card,
    AlertDialog,
    AlertDialogTrigger,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogAction,
    AlertDialogCancel,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    defaultTableState,
  }
})

// Mock avatar-name-cell
vi.mock('../avatar-name-cell', () => ({
  AvatarNameCell: ({ fullName }: { fullName: string; avatarUrl?: string | null }) => (
    <div data-testid="avatar-name-cell">
      <span>{fullName}</span>
    </div>
  ),
}))

import { ChangeRequestQueue } from './change-request-queue'

describe('ChangeRequestQueue', () => {
  beforeEach(() => {
    capturedColumns = []
    mockListQuery.mockResolvedValue({
      requests: [],
      totalCount: 0,
      stats: { pending: 0, approvedToday: 0, rejectedToday: 0, oldestDays: 0 },
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders without crashing (smoke test)', async () => {
    const { container } = render(<ChangeRequestQueue />)
    expect(container).toBeTruthy()
    await act(async () => {
      await Promise.resolve()
    })
  })

  it('renders 4 stats cards', async () => {
    await act(async () => {
      render(<ChangeRequestQueue />)
      await Promise.resolve()
    })
    const cards = screen.getAllByTestId('stats-card')
    expect(cards).toHaveLength(4)
  })

  it('renders all three tab triggers', async () => {
    await act(async () => {
      render(<ChangeRequestQueue />)
      await Promise.resolve()
    })
    expect(screen.getByTestId('tab-my_review')).toBeInTheDocument()
    expect(screen.getByTestId('tab-all_pending')).toBeInTheDocument()
    expect(screen.getByTestId('tab-recent')).toBeInTheDocument()
  })

  it('renders tab labels correctly', async () => {
    await act(async () => {
      render(<ChangeRequestQueue />)
      await Promise.resolve()
    })
    expect(screen.getByText('Pending My Review')).toBeInTheDocument()
    expect(screen.getByText('All Pending')).toBeInTheDocument()
    expect(screen.getByText('Recently Decided')).toBeInTheDocument()
  })

  it('renders DataTable in loading state initially', () => {
    render(<ChangeRequestQueue />)
    expect(screen.getByTestId('data-table-loading')).toBeInTheDocument()
  })
})
