import * as React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

// Mock @future/ui with simple passthrough components
vi.mock('@future/ui', () => {
  function Card({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
      <div data-testid="card" className={className}>
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

  function Badge({
    children,
    variant,
    className,
  }: {
    children: React.ReactNode
    variant?: string
    className?: string
  }) {
    return (
      <span data-testid="badge" data-variant={variant} className={className}>
        {children}
      </span>
    )
  }

  function Select({
    children,
    _value,
    _onValueChange,
  }: {
    children: React.ReactNode
    value?: string
    onValueChange?: (v: string) => void
  }) {
    return <div data-testid="select">{children}</div>
  }

  function SelectTrigger({
    children,
    className,
  }: {
    children: React.ReactNode
    className?: string
  }) {
    return (
      <div data-testid="select-trigger" className={className}>
        {children}
      </div>
    )
  }

  function SelectValue({ placeholder }: { placeholder?: string }) {
    return <span>{placeholder}</span>
  }

  function SelectContent({ children }: { children: React.ReactNode }) {
    return <div data-testid="select-content">{children}</div>
  }

  function SelectItem({ children, value }: { children: React.ReactNode; value: string }) {
    return (
      <div data-testid="select-item" data-value={value}>
        {children}
      </div>
    )
  }

  function Progress({ value, className }: { value: number; className?: string }) {
    return <div data-testid="progress" data-value={value} className={className} />
  }

  return {
    Card,
    Button,
    Badge,
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
    Progress,
  }
})

import { ImportWizard } from './import-wizard'

describe('ImportWizard', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders step 1 (upload) by default', () => {
    render(<ImportWizard />)
    expect(screen.getByText('Drop CSV or XLSX file here')).toBeInTheDocument()
    expect(screen.getByText('Browse Files')).toBeInTheDocument()
  })

  it('shows 5 steps in the step indicator', () => {
    render(<ImportWizard />)
    // Check for step labels
    expect(screen.getByText('Upload')).toBeInTheDocument()
    expect(screen.getByText('Mapping')).toBeInTheDocument()
    expect(screen.getByText('Validation')).toBeInTheDocument()
    expect(screen.getByText('Preview')).toBeInTheDocument()
    expect(screen.getByText('Processing')).toBeInTheDocument()
  })

  it('does not show Continue button when no file is selected', () => {
    render(<ImportWizard />)
    // Continue button only appears when file is set
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument()
  })

  it('renders without crashing (smoke test)', () => {
    const { container } = render(<ImportWizard />)
    expect(container).toBeTruthy()
  })
})
