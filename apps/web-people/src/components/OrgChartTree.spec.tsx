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

const root: OrgChartNode = {
  employmentId: 'root-1',
  personProfileId: 'profile-root',
  fullName: 'Ada Root',
  jobTitle: 'Director',
  departmentName: 'Engineering',
  locationName: 'Singapore',
  avatarUrl: null,
  managerEmploymentId: null,
  directReportCount: 1,
  hasDirectReports: true,
  relationshipToViewer: 'root',
}

const orphan: OrgChartNode = {
  employmentId: 'orphan-1',
  personProfileId: 'profile-orphan',
  fullName: 'Olive Orphan',
  jobTitle: 'Engineer',
  departmentName: 'Engineering',
  locationName: 'Singapore',
  avatarUrl: null,
  managerEmploymentId: 'missing-manager',
  directReportCount: 0,
  hasDirectReports: false,
  relationshipToViewer: undefined,
}

function mockChart(overrides: Partial<ReturnType<typeof useOrgChartMock>> = {}) {
  useOrgChartMock.mockReturnValue({
    visibleNodes: [self],
    nodesById: new Map([['self-1', self]]),
    childrenByParentId: new Map(),
    expandedIds: new Set(['self-1']),
    rootEmploymentIds: ['self-1'],
    focusEmploymentId: 'self-1',
    isLoadingContext: false,
    contextError: null,
    childLoadingIds: new Set(),
    childErrorsById: new Map(),
    selectedTeamId: null,
    setSelectedTeamId: vi.fn(),
    availableTeams: [],
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

  it('renders toolbar with zoom controls, filter chips, compact toggle, and export button', () => {
    render(<OrgChartTree />)

    expect(screen.getByRole('button', { name: /zoom out/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /zoom in/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /reset view/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /export org chart/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /compact view/i })).toBeTruthy()
    expect(screen.queryByPlaceholderText(/find person/i)).toBeNull()
    expect(screen.queryByText(/expand all/i)).toBeNull()
    expect(screen.queryByText(/collapse all/i)).toBeNull()
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

  it('renders top-level branches from rootEmploymentIds only', () => {
    mockChart({
      visibleNodes: [root, orphan],
      nodesById: new Map([
        ['root-1', root],
        ['orphan-1', orphan],
      ]),
      rootEmploymentIds: ['root-1'],
      expandedIds: new Set(),
      focusEmploymentId: null,
    })

    render(<OrgChartTree />)

    expect(screen.getByText('Ada Root')).toBeTruthy()
    expect(screen.queryByText('Olive Orphan')).toBeNull()
  })

  it('renders destructive retry UI when the initial context request fails', () => {
    mockChart({ contextError: 'Context failed' })

    render(<OrgChartTree />)

    expect(screen.getByText('Context failed')).toBeTruthy()
    expect(screen.getByRole('button', { name: /retry org chart context/i })).toBeTruthy()
  })

  it('renders a clear empty state when no org root can be resolved', () => {
    mockChart({
      visibleNodes: [],
      nodesById: new Map(),
      childrenByParentId: new Map(),
      expandedIds: new Set(),
      rootEmploymentIds: [],
      focusEmploymentId: null,
    })

    render(<OrgChartTree />)

    expect(screen.getByText(/No org placement found/i)).toBeTruthy()
    expect(screen.getByText(/could not find an org chart position to display/i)).toBeTruthy()
  })

  it('renders Team filter and visual-only Location chip in toolbar', () => {
    render(<OrgChartTree />)
    expect(screen.getByLabelText(/team filter/i)).toBeTruthy()
    expect(screen.getByText('Location')).toBeTruthy()
  })

  it('keeps theme-safe canvas label for org chart area', () => {
    render(<OrgChartTree />)
    expect(screen.getByLabelText('Org chart canvas')).toBeTruthy()
  })

  it('renders connector elements for parent-child branches', () => {
    mockChart({
      nodesById: new Map([
        ['self-1', self],
        [
          'report-1',
          {
            ...self,
            employmentId: 'report-1',
            fullName: 'Riley Report',
            managerEmploymentId: 'self-1',
          },
        ],
      ]),
      childrenByParentId: new Map([['self-1', ['report-1']]]),
      expandedIds: new Set(['self-1']),
      rootEmploymentIds: ['self-1'],
    })
    render(<OrgChartTree />)
    expect(screen.getAllByTestId('org-connector').length).toBeGreaterThan(0)
  })

  it('toggles compact mode when compact view button is clicked', () => {
    render(<OrgChartTree />)

    const btn = screen.getByRole('button', { name: /compact view/i })
    expect(btn.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(btn)
    expect(btn.getAttribute('aria-pressed')).toBe('true')
  })
})
