import * as React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'

const { mockDirectoryList, mockListTemplates, mockStartCase } = vi.hoisted(() => ({
  mockDirectoryList: vi.fn().mockResolvedValue({
    rows: [{ id: 'emp-1', fullName: 'Alice Nguyen' }],
    totalCount: 1,
  }),
  mockListTemplates: vi
    .fn()
    .mockResolvedValue([{ id: 'tmpl-1', name: 'Standard Onboarding', taskCount: 5, tasks: [] }]),
  mockStartCase: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../lib/trpc', () => ({
  trpc: {
    people: {
      directory: {
        list: { query: mockDirectoryList },
      },
      listOnboardingTemplates: { query: mockListTemplates },
      onboarding: {
        startCase: { mutate: mockStartCase },
      },
    },
  },
}))

vi.mock('@future/ui', () => {
  function Dialog({
    open,
    children,
  }: {
    open: boolean
    onOpenChange?: (v: boolean) => void
    children: React.ReactNode
  }) {
    if (!open) return null
    return <div data-testid="dialog">{children}</div>
  }
  function DialogContent({ children }: { children: React.ReactNode }) {
    return <div data-testid="dialog-content">{children}</div>
  }
  function DialogHeader({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>
  }
  function DialogTitle({ children }: { children: React.ReactNode }) {
    return <h2>{children}</h2>
  }
  function DialogFooter({ children }: { children: React.ReactNode }) {
    return <div data-testid="dialog-footer">{children}</div>
  }
  function Button({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    variant?: string
    className?: string
  }) {
    return (
      <button onClick={onClick} disabled={disabled}>
        {children}
      </button>
    )
  }
  function Spinner({ className }: { className?: string }) {
    return <svg data-testid="spinner" className={className} />
  }
  function Select({
    value,
    onValueChange,
    children,
  }: {
    value?: string
    onValueChange?: (v: string) => void
    children: React.ReactNode
  }) {
    return (
      <select data-testid="select" value={value} onChange={(e) => onValueChange?.(e.target.value)}>
        {children}
      </select>
    )
  }
  function SelectTrigger({ children }: { children: React.ReactNode }) {
    return <>{children}</>
  }
  function SelectValue({ placeholder }: { placeholder?: string }) {
    return <option value="">{placeholder}</option>
  }
  function SelectContent({ children }: { children: React.ReactNode }) {
    return <>{children}</>
  }
  function SelectItem({ value, children }: { value: string; children: React.ReactNode }) {
    return <option value={value}>{children}</option>
  }

  const defaultTableState = {
    search: '',
    filters: [],
    sorting: [],
    pagination: { pageIndex: 0, pageSize: 20 },
    columnVisibility: {},
    columnPinning: {},
    density: 'default',
  }

  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })

  return {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    Button,
    Spinner,
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
    defaultTableState,
    toast,
  }
})

// toast is re-exported from @future/ui — included in the @future/ui mock below

import { NewOnboardingDialog } from './NewOnboardingDialog'

describe('NewOnboardingDialog', () => {
  beforeEach(() => {
    mockDirectoryList.mockResolvedValue({
      rows: [{ id: 'emp-1', fullName: 'Alice Nguyen' }],
      totalCount: 1,
    })
    mockListTemplates.mockResolvedValue([
      { id: 'tmpl-1', name: 'Standard Onboarding', taskCount: 5, tasks: [] },
    ])
    mockStartCase.mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders employee and template fields when open', async () => {
    await act(async () => {
      render(<NewOnboardingDialog open={true} onOpenChange={vi.fn()} onSuccess={vi.fn()} />)
      await Promise.resolve()
    })

    expect(screen.getByText('Employee')).toBeInTheDocument()
    expect(screen.getByText('Onboarding template')).toBeInTheDocument()
  })

  it('calls startCase with correct payload on submit', async () => {
    const onSuccess = vi.fn()
    await act(async () => {
      render(<NewOnboardingDialog open={true} onOpenChange={vi.fn()} onSuccess={onSuccess} />)
      await Promise.resolve()
    })

    const selects = screen.getAllByTestId('select')
    fireEvent.change(selects[0]!, { target: { value: 'emp-1' } })
    fireEvent.change(selects[1]!, { target: { value: 'tmpl-1' } })

    await act(async () => {
      fireEvent.click(screen.getByText('Start onboarding'))
      await Promise.resolve()
    })

    expect(mockStartCase).toHaveBeenCalledWith(
      expect.objectContaining({ employmentId: 'emp-1', templateId: 'tmpl-1' }),
    )
  })

  it('shows inline error for OnboardingCaseAlreadyExistsException', async () => {
    mockStartCase.mockRejectedValueOnce({ data: { code: 'ONBOARDING_CASE_ALREADY_EXISTS' } })

    await act(async () => {
      render(<NewOnboardingDialog open={true} onOpenChange={vi.fn()} onSuccess={vi.fn()} />)
      await Promise.resolve()
    })

    const selects = screen.getAllByTestId('select')
    fireEvent.change(selects[0]!, { target: { value: 'emp-1' } })

    await act(async () => {
      fireEvent.click(screen.getByText('Start onboarding'))
      await Promise.resolve()
    })

    expect(
      screen.getByText('This employee already has an active onboarding case.'),
    ).toBeInTheDocument()
  })

  it('shows inline error for NoOnboardingTemplateException', async () => {
    mockStartCase.mockRejectedValueOnce({ data: { code: 'NO_ONBOARDING_TEMPLATE' } })

    await act(async () => {
      render(<NewOnboardingDialog open={true} onOpenChange={vi.fn()} onSuccess={vi.fn()} />)
      await Promise.resolve()
    })

    const selects = screen.getAllByTestId('select')
    fireEvent.change(selects[0]!, { target: { value: 'emp-1' } })

    await act(async () => {
      fireEvent.click(screen.getByText('Start onboarding'))
      await Promise.resolve()
    })

    expect(
      screen.getByText('No template found. Configure an onboarding template in Settings.'),
    ).toBeInTheDocument()
  })

  it('calls onSuccess on successful submit', async () => {
    const onSuccess = vi.fn()
    await act(async () => {
      render(<NewOnboardingDialog open={true} onOpenChange={vi.fn()} onSuccess={onSuccess} />)
      await Promise.resolve()
    })

    const selects = screen.getAllByTestId('select')
    fireEvent.change(selects[0]!, { target: { value: 'emp-1' } })

    await act(async () => {
      fireEvent.click(screen.getByText('Start onboarding'))
      await Promise.resolve()
    })

    expect(onSuccess).toHaveBeenCalledOnce()
  })

  it('pre-selects template when only one exists', async () => {
    mockListTemplates.mockResolvedValue([
      { id: 'tmpl-solo', name: 'Solo Template', taskCount: 3, tasks: [] },
    ])

    await act(async () => {
      render(<NewOnboardingDialog open={true} onOpenChange={vi.fn()} onSuccess={vi.fn()} />)
      await Promise.resolve()
    })

    const selects = screen.getAllByTestId('select')
    expect((selects[1]! as HTMLSelectElement).value).toBe('tmpl-solo')
  })
})
