import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'

// ----------------------------------------------------------------
// Session mock — controlled per test
// ----------------------------------------------------------------
let mockSession: { actorId: string; tenantId: string } | null = null

vi.mock('@future/auth', () => ({
  useSession: () => mockSession,
}))

// ----------------------------------------------------------------
// React Query mock — controlled per test
// ----------------------------------------------------------------
let mockIsLoading = false
let mockPlans: unknown[] = []

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mockPlans, isLoading: mockIsLoading }),
}))

// ----------------------------------------------------------------
// trpc stub — not called in loading path but must be importable
// ----------------------------------------------------------------
vi.mock('../../lib/trpc', () => ({
  trpc: {
    planner: {
      plans: {
        list: { query: vi.fn().mockResolvedValue([]) },
      },
    },
  },
}))

// ----------------------------------------------------------------
// next/link stub
// ----------------------------------------------------------------
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: React.ReactNode
    [key: string]: unknown
  }) => React.createElement('a', { href, ...rest }, children),
}))

// ----------------------------------------------------------------
// Lazy import after all mocks are set up
// ----------------------------------------------------------------
const { default: PlansPage } = await import('./page')

const SESSION = { actorId: 'actor-1', tenantId: 'tenant-1' }

beforeEach(() => {
  mockSession = SESSION
  mockIsLoading = false
  mockPlans = []
})

afterEach(() => {
  cleanup()
})

describe('PlansPage loading state', () => {
  it('renders the full skeleton when isLoading is true', () => {
    mockIsLoading = true

    render(<PlansPage />)

    expect(screen.getByTestId('plans-loading-skeleton')).toBeDefined()
    expect(screen.getByLabelText('Loading plans')).toBeDefined()
    // Should NOT show the grid or empty state
    expect(screen.queryByTestId('plans-empty-state')).toBeNull()
    expect(screen.queryByTestId('plans-grid')).toBeNull()
  })

  it('renders the skeleton when session is null', () => {
    mockSession = null
    mockIsLoading = false

    render(<PlansPage />)

    expect(screen.getByTestId('plans-loading-skeleton')).toBeDefined()
  })
})

describe('PlansPage empty state', () => {
  it('renders icon, heading, description, and CTA when plans array is empty', () => {
    render(<PlansPage />)

    expect(screen.getByTestId('plans-empty-state')).toBeDefined()
    expect(screen.getByText('No plans yet')).toBeDefined()
    expect(screen.getByText('Create your first plan to get started')).toBeDefined()
    // CTA "New plan" button
    const links = screen.getAllByRole('link', { name: /new plan/i })
    expect(links.length).toBeGreaterThan(0)
  })
})

describe('PlansPage with plans', () => {
  it('renders plan cards in the grid when plans exist', () => {
    mockPlans = [
      {
        id: 'plan-1',
        name: 'Alpha Plan',
        memberCount: 3,
        myRole: 'owner',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'plan-2',
        name: 'Beta Plan',
        memberCount: 1,
        myRole: 'editor',
        updatedAt: '2026-01-02T00:00:00Z',
      },
    ]

    render(<PlansPage />)

    expect(screen.getByTestId('plans-grid')).toBeDefined()
    expect(screen.getByText('Alpha Plan')).toBeDefined()
    expect(screen.getByText('Beta Plan')).toBeDefined()
    // Empty state should not appear
    expect(screen.queryByTestId('plans-empty-state')).toBeNull()
  })

  it('shows member count and role for each plan', () => {
    mockPlans = [
      {
        id: 'plan-1',
        name: 'My Plan',
        memberCount: 5,
        myRole: 'owner',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]

    render(<PlansPage />)

    expect(screen.getByText('5')).toBeDefined()
    expect(screen.getByText('owner')).toBeDefined()
  })
})
