// apps/web-people/src/components/settings/MsImportsTable.spec.tsx
import * as React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock @future/ui with simple passthrough components
vi.mock('@future/ui', () => {
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

  function Checkbox({
    checked,
    onCheckedChange,
    'aria-label': ariaLabel,
  }: {
    checked?: boolean
    onCheckedChange?: (checked: boolean) => void
    'aria-label'?: string
  }) {
    return (
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
        aria-label={ariaLabel}
      />
    )
  }

  function Spinner({ className }: { className?: string }) {
    return <span data-testid="spinner" className={className} />
  }

  function Table({ children, className }: { children: React.ReactNode; className?: string }) {
    return <table className={className}>{children}</table>
  }

  function TableHeader({ children, className }: { children: React.ReactNode; className?: string }) {
    return <thead className={className}>{children}</thead>
  }

  function TableBody({ children }: { children: React.ReactNode }) {
    return <tbody>{children}</tbody>
  }

  function TableRow({ children, className }: { children: React.ReactNode; className?: string }) {
    return <tr className={className}>{children}</tr>
  }

  function TableHead({ children, className }: { children: React.ReactNode; className?: string }) {
    return <th className={className}>{children}</th>
  }

  function TableCell({
    children,
    className,
    colSpan,
  }: {
    children?: React.ReactNode
    className?: string
    colSpan?: number
  }) {
    return (
      <td className={className} colSpan={colSpan}>
        {children}
      </td>
    )
  }

  return {
    Button,
    Checkbox,
    Spinner,
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
  }
})

import { MsImportsTable } from './MsImportsTable'
import type { MsStagedUser } from '../../lib/types'

afterEach(cleanup)

const mockUser: MsStagedUser = {
  id: 'su1',
  tenantId: 't1',
  msExternalId: 'aad-u1',
  displayName: 'Alice Nguyen',
  email: 'alice@co.com',
  jobTitle: 'Engineer',
  department: 'R&D',
  officeLocation: 'HCM',
  mobilePhone: null,
  workPhone: null,
  managerMsId: null,
  photoDocumentId: null,
  status: 'pending',
  importedEmploymentId: null,
  lastSeenAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
}

describe('MsImportsTable', () => {
  it('renders user row with name, email, job title', () => {
    render(
      <MsImportsTable
        mode="pending"
        users={[mockUser]}
        onImport={vi.fn()}
        onSkip={vi.fn()}
        onBulkImport={vi.fn()}
        onBulkSkip={vi.fn()}
        isLoading={false}
      />,
    )
    expect(screen.getByText('Alice Nguyen')).toBeTruthy()
    expect(screen.getByText('alice@co.com')).toBeTruthy()
    expect(screen.getByText('Engineer')).toBeTruthy()
  })

  it('calls onImport with user id when Import button clicked', async () => {
    const onImport = vi.fn()
    render(
      <MsImportsTable
        mode="pending"
        users={[mockUser]}
        onImport={onImport}
        onSkip={vi.fn()}
        onBulkImport={vi.fn()}
        onBulkSkip={vi.fn()}
        isLoading={false}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /^import$/i }))
    expect(onImport).toHaveBeenCalledWith('su1')
  })

  it('disables bulk action buttons when no rows selected', () => {
    render(
      <MsImportsTable
        mode="pending"
        users={[mockUser]}
        onImport={vi.fn()}
        onSkip={vi.fn()}
        onBulkImport={vi.fn()}
        onBulkSkip={vi.fn()}
        isLoading={false}
      />,
    )
    expect(screen.getByRole('button', { name: /import selected/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /skip selected/i })).toBeDisabled()
  })

  it('enables bulk buttons and calls onBulkImport with selected ids', async () => {
    const onBulkImport = vi.fn()
    render(
      <MsImportsTable
        mode="pending"
        users={[mockUser]}
        onImport={vi.fn()}
        onSkip={vi.fn()}
        onBulkImport={onBulkImport}
        onBulkSkip={vi.fn()}
        isLoading={false}
      />,
    )
    // Check the row checkbox
    const checkbox = screen.getAllByRole('checkbox')[1]! // first is header checkbox
    await userEvent.click(checkbox)
    // Now bulk import button should be enabled
    const bulkImportBtn = screen.getByRole('button', { name: /import selected/i })
    expect(bulkImportBtn).not.toBeDisabled()
    await userEvent.click(bulkImportBtn)
    expect(onBulkImport).toHaveBeenCalledWith(['su1'])
  })

  it('shows Reset to pending button in skipped mode', async () => {
    const onReset = vi.fn()
    render(<MsImportsTable mode="skipped" users={[mockUser]} onReset={onReset} isLoading={false} />)
    const resetBtn = screen.getByRole('button', { name: /reset to pending/i })
    await userEvent.click(resetBtn)
    expect(onReset).toHaveBeenCalledWith('su1')
  })

  it('hides Import and Skip buttons in skipped mode', () => {
    render(<MsImportsTable mode="skipped" users={[mockUser]} onReset={vi.fn()} isLoading={false} />)
    expect(screen.queryByRole('button', { name: /^import$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^skip$/i })).toBeNull()
  })

  it('shows Reset to pending button in imported mode', async () => {
    const onReset = vi.fn()
    render(
      <MsImportsTable mode="imported" users={[mockUser]} onReset={onReset} isLoading={false} />,
    )
    const resetBtn = screen.getByRole('button', { name: /reset to pending/i })
    await userEvent.click(resetBtn)
    expect(onReset).toHaveBeenCalledWith('su1')
  })

  it('hides Import and Skip buttons in imported mode', () => {
    render(
      <MsImportsTable mode="imported" users={[mockUser]} onReset={vi.fn()} isLoading={false} />,
    )
    expect(screen.queryByRole('button', { name: /^import$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^skip$/i })).toBeNull()
  })
})
