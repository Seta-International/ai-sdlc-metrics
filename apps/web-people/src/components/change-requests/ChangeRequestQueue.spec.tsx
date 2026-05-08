import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ColumnDef } from '@future/ui'
import type { ChangeRequestRow } from '../../lib/types-workflows'

const mockUseHrChangeRequests = vi.fn()

vi.mock('../../lib/hooks/use-hr-change-requests', () => ({
  useHrChangeRequests: (filter: 'all_pending' | 'recent') => mockUseHrChangeRequests(filter),
}))

vi.mock('../../lib/trpc', () => ({
  trpc: {
    people: {
      batchApproveChanges: { mutate: vi.fn() },
      batchRejectChanges: { mutate: vi.fn() },
    },
  },
}))

vi.mock('@future/auth', () => ({
  useSession: () => ({
    actorId: '01900000-0000-7000-8000-000000000001',
    tenantId: '01900000-0000-7000-8000-000000000002',
  }),
}))

let capturedColumns: ColumnDef<ChangeRequestRow>[] = []
let capturedEnableRowSelection: boolean | undefined

vi.mock('@future/ui', () => {
  const TabsContext = React.createContext<{
    value: string
    onValueChange: (value: string) => void
  } | null>(null)

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
    enableRowSelection,
  }: {
    columns: ColumnDef<ChangeRequestRow>[]
    rows: ChangeRequestRow[]
    state: unknown
    totalCount: number
    onStateChange: (state: unknown) => void
    isLoading?: boolean
    enableRowSelection?: boolean
  }) {
    capturedColumns = columns
    capturedEnableRowSelection = enableRowSelection
    return <div data-testid="data-table" />
  }

  function Tabs({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode
    value: string
    onValueChange: (value: string) => void
  }) {
    return (
      <TabsContext value={{ value, onValueChange }}>
        <div>{children}</div>
      </TabsContext>
    )
  }

  function TabsList({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>
  }

  function TabsTrigger({ children, value }: { children: React.ReactNode; value: string }) {
    const ctx = React.use(TabsContext)
    return (
      <button type="button" role="tab" onClick={() => ctx?.onValueChange(value)}>
        {children}
      </button>
    )
  }

  function TabsContent({ children, value }: { children: React.ReactNode; value: string }) {
    const ctx = React.use(TabsContext)
    return ctx?.value === value ? <div>{children}</div> : null
  }

  function Card({ children }: { children: React.ReactNode; className?: string }) {
    return <div data-testid="stats-card">{children}</div>
  }

  function Button({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return <button {...props}>{children}</button>
  }

  function Checkbox() {
    return <div data-testid="checkbox" />
  }

  function Badge({ children }: { children: React.ReactNode; variant?: string }) {
    return <span>{children}</span>
  }

  function AlertDialog({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>
  }
  function AlertDialogTrigger({ children }: { children: React.ReactNode; asChild?: boolean }) {
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
  function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return <textarea {...props} />
  }
  function Spinner() {
    return <div data-testid="spinner" />
  }
  const toast = { success: vi.fn(), error: vi.fn() }

  return {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
    Badge,
    Button,
    Card,
    Checkbox,
    DataTable,
    Spinner,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    Textarea,
    defaultTableState,
    toast,
  }
})

vi.mock('@future/ui/icons', () => ({
  ArrowRight: () => <span>{'->'}</span>,
  Check: () => <span>check</span>,
  X: () => <span>x</span>,
}))

vi.mock('../AvatarNameCell', () => ({
  AvatarNameCell: ({ fullName }: { fullName: string }) => <div>{fullName}</div>,
}))

const pendingRow: ChangeRequestRow = {
  id: 'batch-1',
  employmentId: 'emp-1',
  employeeName: 'Alice Johnson',
  avatarUrl: null,
  fieldPath: 'employment_detail.personal_phone',
  fieldLabel: 'Personal phone',
  oldValue: '0901',
  newValue: '0902',
  requestedBy: 'actor-1',
  requestedByName: 'Alice Johnson',
  requestedAt: '2026-05-05T00:00:00.000Z',
  effectiveDate: null,
  status: 'pending',
  reviewedBy: null,
  reviewedByName: null,
  reviewedAt: null,
  reviewNote: null,
  editPolicyLabel: 'HR approval',
}

const decidedRow: ChangeRequestRow = {
  ...pendingRow,
  id: 'batch-2',
  status: 'approved',
  reviewedBy: 'reviewer-1',
  reviewedByName: 'HR Reviewer',
  reviewedAt: '2026-05-05T01:00:00.000Z',
}

async function renderQueue() {
  const { ChangeRequestQueue } = await import('./ChangeRequestQueue')
  render(<ChangeRequestQueue />)
}

describe('ChangeRequestQueue', () => {
  beforeEach(() => {
    capturedColumns = []
    capturedEnableRowSelection = undefined
    const pendingResult = {
      rows: [pendingRow],
      stats: { pending: 1, approvedToday: 1, rejectedToday: 0, oldestDays: 0 },
      isLoading: false,
      refetch: vi.fn(),
    }
    const recentResult = {
      rows: [decidedRow],
      stats: { pending: 1, approvedToday: 1, rejectedToday: 0, oldestDays: 0 },
      isLoading: false,
      refetch: vi.fn(),
    }
    mockUseHrChangeRequests.mockImplementation((filter: 'all_pending' | 'recent') =>
      filter === 'recent' ? recentResult : pendingResult,
    )
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the stats bar with four cards', async () => {
    await renderQueue()
    expect(screen.getAllByTestId('stats-card')).toHaveLength(4)
  })

  it('disables built-in DataTable row selection for this screen', async () => {
    await renderQueue()
    expect(capturedEnableRowSelection).toBe(false)
  })

  it('includes a custom select column in the All Pending tab', async () => {
    await renderQueue()
    await userEvent.click(screen.getByRole('tab', { name: /all pending/i }))
    expect(capturedColumns.some((column) => 'id' in column && column.id === 'select')).toBe(true)
  })

  it('does not include a select column in the Recently Decided tab', async () => {
    await renderQueue()
    await userEvent.click(screen.getByRole('tab', { name: /recently decided/i }))
    expect(capturedColumns.some((column) => 'id' in column && column.id === 'select')).toBe(false)
  })
})
