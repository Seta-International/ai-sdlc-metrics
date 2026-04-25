import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import GaReadinessPage from './page'
import { useQuery } from '@future/api-client'

vi.mock('@/components/admin-page-header', () => ({
  AdminPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

vi.mock('@future/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@future/api-client')>()
  return { ...actual, useQuery: vi.fn() }
})

vi.mock('@/lib/trpc', () => ({
  trpc: {
    agents: {
      readiness: {
        getState: { query: vi.fn().mockResolvedValue(null) },
        getCriteria: { query: vi.fn().mockResolvedValue([]) },
      },
    },
  },
}))

const mockedUseQuery = vi.mocked(useQuery)

function makeStateResult(overrides?: object) {
  return {
    data: {
      isGaReady: false,
      computedAt: '2026-04-25T00:00:00.000Z',
      consecutiveWindowsMet: 0,
      missingCriteria: [],
      tenantCount: 5,
      interactiveTurnsPerDay: 10,
      p1SecurityIncidentsLast90d: 0,
      ...overrides,
    },
    isLoading: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useQuery>
}

function makeCriteriaResult(items: object[] = []) {
  return {
    data: items,
    isLoading: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useQuery>
}

describe('<GaReadinessPage />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders "GA Readiness" heading', () => {
    mockedUseQuery.mockReturnValueOnce(makeStateResult()).mockReturnValueOnce(makeCriteriaResult())

    render(<GaReadinessPage />)

    expect(screen.getByRole('heading', { name: /GA Readiness/i })).toBeInTheDocument()
  })

  it('shows loading skeletons while fetching', () => {
    mockedUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useQuery>)

    const { container } = render(<GaReadinessPage />)

    // Skeletons render as divs with data-slot="skeleton"
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows "GA Ready" badge when isGaReady is true', () => {
    mockedUseQuery
      .mockReturnValueOnce(makeStateResult({ isGaReady: true, consecutiveWindowsMet: 2 }))
      .mockReturnValueOnce(makeCriteriaResult())

    render(<GaReadinessPage />)

    expect(screen.getByText('GA Ready')).toBeInTheDocument()
    expect(screen.queryByText('Not GA Ready')).not.toBeInTheDocument()
  })

  it('shows "Not GA Ready" badge when isGaReady is false', () => {
    mockedUseQuery
      .mockReturnValueOnce(makeStateResult({ isGaReady: false, consecutiveWindowsMet: 1 }))
      .mockReturnValueOnce(makeCriteriaResult())

    render(<GaReadinessPage />)

    expect(screen.getByText('Not GA Ready')).toBeInTheDocument()
    expect(screen.queryByText('GA Ready')).not.toBeInTheDocument()
  })

  it('shows error alert when fetch fails', () => {
    mockedUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
    } as unknown as ReturnType<typeof useQuery>)

    render(<GaReadinessPage />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/Failed to load GA readiness data/i)).toBeInTheDocument()
  })

  it('renders criteria grouped by section', () => {
    const criteria = [
      {
        id: 'c1',
        criterionId: 'reliability.uptime',
        passed: true,
        observedValue: '99.9%',
        threshold: '99.5%',
        windowEnd: '2026-04-25T00:00:00.000Z',
        notes: null,
      },
      {
        id: 'c2',
        criterionId: 'security.incidents',
        passed: false,
        observedValue: '2',
        threshold: '0',
        windowEnd: '2026-04-25T00:00:00.000Z',
        notes: 'Two P1 incidents detected',
      },
    ]

    mockedUseQuery
      .mockReturnValueOnce(makeStateResult({ isGaReady: false }))
      .mockReturnValueOnce(makeCriteriaResult(criteria))

    render(<GaReadinessPage />)

    expect(screen.getByText('Reliability')).toBeInTheDocument()
    expect(screen.getByText('Security')).toBeInTheDocument()
    expect(screen.getByText('reliability.uptime')).toBeInTheDocument()
    expect(screen.getByText('security.incidents')).toBeInTheDocument()
    expect(screen.getByText('Pass')).toBeInTheDocument()
    expect(screen.getByText('Fail')).toBeInTheDocument()
    expect(screen.getByText('Two P1 incidents detected')).toBeInTheDocument()
  })

  it('shows consecutive windows progress text', () => {
    mockedUseQuery
      .mockReturnValueOnce(makeStateResult({ consecutiveWindowsMet: 1 }))
      .mockReturnValueOnce(makeCriteriaResult())

    render(<GaReadinessPage />)

    expect(screen.getByText(/1 \/ 2 consecutive windows met/i)).toBeInTheDocument()
  })
})
