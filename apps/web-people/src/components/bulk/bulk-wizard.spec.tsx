import * as React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

// Mock trpc
vi.mock('../../lib/trpc', () => ({
  trpc: {
    people: {
      directory: {
        list: {
          query: vi.fn().mockResolvedValue({ rows: [], totalCount: 0 }),
        },
      },
    },
  },
}))

// Mock @future/ui
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

  function Card({
    children,
    className,
    onClick,
  }: {
    children: React.ReactNode
    className?: string
    onClick?: () => void
  }) {
    return (
      <div data-testid="card" className={className} onClick={onClick}>
        {children}
      </div>
    )
  }

  function Button({
    children,
    onClick,
    disabled,
    variant,
    size,
    className,
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    variant?: string
    size?: string
    className?: string
  }) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        data-variant={variant}
        data-size={size}
        className={className}
      >
        {children}
      </button>
    )
  }

  function Progress({ value, className }: { value: number; className?: string }) {
    return <div data-testid="progress" data-value={value} className={className} />
  }

  function Select({ children }: { children: React.ReactNode }) {
    return <div data-testid="select">{children}</div>
  }

  function SelectTrigger({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>
  }

  function SelectValue({ placeholder }: { placeholder?: string }) {
    return <span>{placeholder}</span>
  }

  function SelectContent({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>
  }

  function SelectItem({ children, value }: { children: React.ReactNode; value: string }) {
    return <div data-value={value}>{children}</div>
  }

  function Input({
    placeholder,
    type,
    onChange,
    className,
  }: {
    placeholder?: string
    type?: string
    onChange?: React.ChangeEventHandler<HTMLInputElement>
    className?: string
  }) {
    return <input placeholder={placeholder} type={type} onChange={onChange} className={className} />
  }

  function DataTable({
    columns,
    isLoading,
  }: {
    columns: unknown[]
    rows: unknown[]
    isLoading?: boolean
    state?: unknown
    totalCount?: number
    onStateChange?: (s: unknown) => void
  }) {
    if (isLoading) return <div data-testid="data-table-loading">Loading...</div>
    return <div data-testid="data-table" />
  }

  function Badge({ children, variant }: { children: React.ReactNode; variant?: string }) {
    return (
      <span data-testid="badge" data-variant={variant}>
        {children}
      </span>
    )
  }

  return {
    Card,
    Button,
    Progress,
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
    Input,
    DataTable,
    Badge,
    defaultTableState,
  }
})

// Mock avatar-name-cell
vi.mock('../avatar-name-cell', () => ({
  AvatarNameCell: ({
    fullName,
  }: {
    fullName: string
    avatarUrl?: string | null
    subtitle?: string | null
  }) => <div data-testid="avatar-name-cell">{fullName}</div>,
}))

import { BulkWizard } from './bulk-wizard'

describe('BulkWizard', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders step 1 (operation selection) by default', () => {
    render(<BulkWizard />)
    // Should show the operation step label as active
    expect(screen.getByText('Operation')).toBeInTheDocument()
  })

  it('shows 3 operation cards', () => {
    render(<BulkWizard />)
    expect(screen.getByText('Change Department')).toBeInTheDocument()
    expect(screen.getByText('Change Manager')).toBeInTheDocument()
    expect(screen.getByText('Change Status')).toBeInTheDocument()
  })

  it('Continue button is disabled when no operation is selected', () => {
    render(<BulkWizard />)
    const continueButton = screen.getByRole('button', { name: /continue/i })
    expect(continueButton).toBeDisabled()
  })

  it('shows 5 steps in the step indicator', () => {
    render(<BulkWizard />)
    expect(screen.getByText('Operation')).toBeInTheDocument()
    expect(screen.getByText('Employees')).toBeInTheDocument()
    expect(screen.getByText('Configure')).toBeInTheDocument()
    expect(screen.getByText('Preview')).toBeInTheDocument()
    expect(screen.getByText('Confirm')).toBeInTheDocument()
  })

  it('renders without crashing (smoke test)', () => {
    const { container } = render(<BulkWizard />)
    expect(container).toBeTruthy()
  })
})
