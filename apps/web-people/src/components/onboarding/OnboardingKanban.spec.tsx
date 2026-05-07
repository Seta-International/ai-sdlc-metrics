import * as React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import type { OnboardingCase } from '../../lib/types-workflows'

const { mockListCasesQuery, mockRouterPush } = vi.hoisted(() => ({
  mockListCasesQuery: vi.fn().mockResolvedValue([]),
  mockRouterPush: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  useParams: () => ({}),
}))

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

vi.mock('@future/ui', () => {
  function Progress({ value }: { value: number; className?: string }) {
    return <div data-testid="progress" data-value={value} />
  }

  function Skeleton({ className }: { className?: string }) {
    return <div data-testid="skeleton" className={className} />
  }

  function Button({
    children,
    onClick,
    className,
    variant,
    size,
  }: {
    children: React.ReactNode
    onClick?: () => void
    className?: string
    variant?: string
    size?: string
  }) {
    return (
      <button onClick={onClick} className={className} data-variant={variant} data-size={size}>
        {children}
      </button>
    )
  }

  return { Progress, Skeleton, Button }
})

vi.mock('@future/ui/icons', () => ({
  CalendarDays: ({ className }: { className?: string }) => (
    <svg data-testid="icon-calendar" className={className} />
  ),
  AlertTriangle: ({ className }: { className?: string }) => (
    <svg data-testid="icon-alert-triangle" className={className} />
  ),
  Plus: ({ className }: { className?: string }) => (
    <svg data-testid="icon-plus" className={className} />
  ),
}))

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

function makeCase(overrides: Partial<OnboardingCase> = {}): OnboardingCase {
  return {
    id: 'case-1',
    employmentId: 'emp-1',
    employeeName: 'Alice Nguyen',
    jobTitle: 'Engineer',
    department: 'Engineering',
    avatarUrl: null,
    startDate: '2026-05-10',
    stage: 'offer_accepted',
    tasksTotal: 5,
    tasksCompleted: 2,
    blockers: 0,
    templateName: '',
    status: 'in_progress',
    ...overrides,
  }
}

import { OnboardingKanban } from './OnboardingKanban'

describe('OnboardingKanban', () => {
  beforeEach(() => {
    mockListCasesQuery.mockResolvedValue([])
    mockRouterPush.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders 4 column labels', async () => {
    await act(async () => {
      render(<OnboardingKanban onAddClick={vi.fn()} />)
      await Promise.resolve()
    })

    expect(screen.getByText('Offer accepted')).toBeInTheDocument()
    expect(screen.getByText('Paperwork')).toBeInTheDocument()
    expect(screen.getByText('Equipment')).toBeInTheDocument()
    expect(screen.getByText('First day ready')).toBeInTheDocument()
  })

  it('places card in correct column', async () => {
    mockListCasesQuery.mockResolvedValue([
      makeCase({ stage: 'paperwork', employeeName: 'Bob', id: 'case-bob' }),
    ])

    await act(async () => {
      render(<OnboardingKanban onAddClick={vi.fn()} />)
      await Promise.resolve()
    })

    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('shows blocker badge when blockers > 0', async () => {
    mockListCasesQuery.mockResolvedValue([makeCase({ blockers: 2 })])

    await act(async () => {
      render(<OnboardingKanban onAddClick={vi.fn()} />)
      await Promise.resolve()
    })

    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByTestId('icon-alert-triangle')).toBeInTheDocument()
  })

  it('hides blocker badge when blockers === 0', async () => {
    mockListCasesQuery.mockResolvedValue([makeCase({ blockers: 0 })])

    await act(async () => {
      render(<OnboardingKanban onAddClick={vi.fn()} />)
      await Promise.resolve()
    })

    expect(screen.queryByTestId('icon-alert-triangle')).not.toBeInTheDocument()
  })

  it('navigates to /onboarding/:id on card click', async () => {
    mockListCasesQuery.mockResolvedValue([makeCase({ id: 'case-1' })])

    await act(async () => {
      render(<OnboardingKanban onAddClick={vi.fn()} />)
      await Promise.resolve()
    })

    const card = screen.getByText('Alice Nguyen').closest('[role="button"]')
    expect(card).not.toBeNull()
    fireEvent.click(card!)

    expect(mockRouterPush).toHaveBeenCalledWith('/onboarding/case-1')
  })

  it('renders skeletons while loading', () => {
    mockListCasesQuery.mockReturnValue(new Promise(() => {}))

    render(<OnboardingKanban onAddClick={vi.fn()} />)

    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
  })
})
