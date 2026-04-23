import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrgChartTree } from './OrgChartTree'
import type { OrgChartNode } from '../lib/types'

const { push, expandNode, collapseNode, retryContext, retryChildren, useOrgChartMock } = vi.hoisted(
  () => ({
    push: vi.fn(),
    expandNode: vi.fn(),
    collapseNode: vi.fn(),
    retryContext: vi.fn(),
    retryChildren: vi.fn(),
    useOrgChartMock: vi.fn(),
  }),
)

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('../lib/hooks/use-org-chart', () => ({
  useOrgChart: useOrgChartMock,
}))

const self: OrgChartNode = {
  employmentId: 'self-1',
  personProfileId: 'profile-self',
  fullName: 'Sam Self',
  jobTitle: 'Senior Engineer',
  departmentName: 'Engineering',
  locationName: 'Singapore',
  avatarUrl: null,
  managerEmploymentId: 'manager-1',
  directReportCount: 2,
  hasDirectReports: true,
  relationshipToViewer: 'self',
}

function mockChart(overrides: Partial<ReturnType<typeof useOrgChartMock>> = {}) {
  useOrgChartMock.mockReturnValue({
    visibleNodes: [self],
    nodesById: new Map([['self-1', self]]),
    childrenByParentId: new Map(),
    expandedIds: new Set(['self-1']),
    focusEmploymentId: 'self-1',
    isLoadingContext: false,
    contextError: null,
    childLoadingIds: new Set(),
    childErrorsById: new Map(),
    expandNode,
    collapseNode,
    retryContext,
    retryChildren,
    ...overrides,
  })
}

describe('OrgChartTree', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChart()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders a V1 read-only toolbar without search, alternate modes, bulk actions, or export', () => {
    render(<OrgChartTree />)

    expect(screen.getByRole('button', { name: /zoom out/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /zoom in/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /reset view/i })).toBeTruthy()
    expect(screen.queryByPlaceholderText(/find person/i)).toBeNull()
    expect(screen.queryByText(/department/i)).toBeNull()
    expect(screen.queryByText(/expand all/i)).toBeNull()
    expect(screen.queryByText(/collapse all/i)).toBeNull()
    expect(screen.queryByText(/export/i)).toBeNull()
  })

  it('controls zoom locally and shows the current percentage', () => {
    render(<OrgChartTree />)

    fireEvent.click(screen.getByRole('button', { name: /zoom in/i }))
    expect(screen.getByText('110%')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /reset view/i }))
    expect(screen.getByText('100%')).toBeTruthy()
  })

  it('routes profile-card actions to the employee profile page', () => {
    render(<OrgChartTree />)

    fireEvent.click(screen.getByRole('button', { name: /view profile for Sam Self/i }))

    expect(push).toHaveBeenCalledWith('/profile/self-1')
  })
})
