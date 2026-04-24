import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrgChartNodeComponent } from './OrgChartNode'
import type { OrgChartNode } from '../lib/types'

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

describe('OrgChartNodeComponent', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders display-safe employee fields and current-user marker', () => {
    render(
      <OrgChartNodeComponent
        node={self}
        nodesById={new Map([['self-1', self]])}
        childrenByParentId={new Map()}
        expandedIds={new Set()}
        childLoadingIds={new Set()}
        childErrorsById={new Map()}
        onExpand={vi.fn()}
        onCollapse={vi.fn()}
        onRetry={vi.fn()}
        onViewProfile={vi.fn()}
      />,
    )

    expect(screen.getByText('Sam Self')).toBeTruthy()
    expect(screen.getByText('Senior Engineer')).toBeTruthy()
    expect(screen.getByText(/Engineering/)).toBeTruthy()
    expect(screen.getByText(/Singapore/)).toBeTruthy()
    expect(screen.getByText('You')).toBeTruthy()
  })

  it('uses explicit expand and profile controls', () => {
    const onExpand = vi.fn()
    const onViewProfile = vi.fn()

    render(
      <OrgChartNodeComponent
        node={self}
        nodesById={new Map([['self-1', self]])}
        childrenByParentId={new Map()}
        expandedIds={new Set()}
        childLoadingIds={new Set()}
        childErrorsById={new Map()}
        onExpand={onExpand}
        onCollapse={vi.fn()}
        onRetry={vi.fn()}
        onViewProfile={onViewProfile}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /expand direct reports for Sam Self/i }))
    fireEvent.click(screen.getByRole('button', { name: /view profile for Sam Self/i }))

    expect(onExpand).toHaveBeenCalledWith('self-1')
    expect(onViewProfile).toHaveBeenCalledWith('self-1')
  })

  it('renders node-local retry UI for child expansion failures', () => {
    render(
      <OrgChartNodeComponent
        node={self}
        nodesById={new Map([['self-1', self]])}
        childrenByParentId={new Map()}
        expandedIds={new Set(['self-1'])}
        childLoadingIds={new Set()}
        childErrorsById={new Map([['self-1', 'Branch failed']])}
        onExpand={vi.fn()}
        onCollapse={vi.fn()}
        onRetry={vi.fn()}
        onViewProfile={vi.fn()}
      />,
    )

    expect(screen.getByText('Branch failed')).toBeTruthy()
    expect(screen.getByRole('button', { name: /retry direct reports for Sam Self/i })).toBeTruthy()
  })

  it('uses Unknown title and Unknown org fallback labels when fields are null', () => {
    render(
      <OrgChartNodeComponent
        node={{ ...self, jobTitle: null, departmentName: null, locationName: null }}
        nodesById={new Map([['self-1', self]])}
        childrenByParentId={new Map()}
        expandedIds={new Set()}
        childLoadingIds={new Set()}
        childErrorsById={new Map()}
        onExpand={vi.fn()}
        onCollapse={vi.fn()}
        onRetry={vi.fn()}
        onViewProfile={vi.fn()}
      />,
    )
    expect(screen.getByText('Unknown title')).toBeTruthy()
    expect(screen.getByText('Unknown org')).toBeTruthy()
  })

  it('marks each rendered card with data-testid=org-card', () => {
    render(
      <OrgChartNodeComponent
        node={self}
        nodesById={new Map([['self-1', self]])}
        childrenByParentId={new Map()}
        expandedIds={new Set()}
        childLoadingIds={new Set()}
        childErrorsById={new Map()}
        onExpand={vi.fn()}
        onCollapse={vi.fn()}
        onRetry={vi.fn()}
        onViewProfile={vi.fn()}
      />,
    )
    expect(screen.getByTestId('org-card')).toBeTruthy()
  })

  it('renders compact pill with name only — no title, no card, no profile button', () => {
    render(
      <OrgChartNodeComponent
        node={self}
        nodesById={new Map([['self-1', self]])}
        childrenByParentId={new Map()}
        expandedIds={new Set()}
        childLoadingIds={new Set()}
        childErrorsById={new Map()}
        compact={true}
        onExpand={vi.fn()}
        onCollapse={vi.fn()}
        onRetry={vi.fn()}
        onViewProfile={vi.fn()}
      />,
    )
    expect(screen.getByText('Sam Self')).toBeTruthy()
    expect(screen.queryByText('Senior Engineer')).toBeNull()
    expect(screen.queryByRole('button', { name: /view profile/i })).toBeNull()
    expect(screen.queryByTestId('org-card')).toBeNull()
  })

  it('shows You badge on compact pill for self node', () => {
    render(
      <OrgChartNodeComponent
        node={self}
        nodesById={new Map([['self-1', self]])}
        childrenByParentId={new Map()}
        expandedIds={new Set()}
        childLoadingIds={new Set()}
        childErrorsById={new Map()}
        compact={true}
        onExpand={vi.fn()}
        onCollapse={vi.fn()}
        onRetry={vi.fn()}
        onViewProfile={vi.fn()}
      />,
    )
    expect(screen.getByText('You')).toBeTruthy()
  })

  it('calls onExpand when compact pill button is clicked while collapsed', () => {
    const onExpand = vi.fn()
    render(
      <OrgChartNodeComponent
        node={self}
        nodesById={new Map([['self-1', self]])}
        childrenByParentId={new Map()}
        expandedIds={new Set()}
        childLoadingIds={new Set()}
        childErrorsById={new Map()}
        compact={true}
        onExpand={onExpand}
        onCollapse={vi.fn()}
        onRetry={vi.fn()}
        onViewProfile={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /expand direct reports for Sam Self/i }))
    expect(onExpand).toHaveBeenCalledWith('self-1')
  })

  it('renders connector elements for expanded children', () => {
    const report1: OrgChartNode = {
      ...self,
      employmentId: 'r-1',
      fullName: 'Alice A',
      managerEmploymentId: 'self-1',
    }
    const report2: OrgChartNode = {
      ...self,
      employmentId: 'r-2',
      fullName: 'Bob B',
      managerEmploymentId: 'self-1',
    }
    render(
      <OrgChartNodeComponent
        node={self}
        nodesById={
          new Map([
            ['self-1', self],
            ['r-1', report1],
            ['r-2', report2],
          ])
        }
        childrenByParentId={new Map([['self-1', ['r-1', 'r-2']]])}
        expandedIds={new Set(['self-1'])}
        childLoadingIds={new Set()}
        childErrorsById={new Map()}
        onExpand={vi.fn()}
        onCollapse={vi.fn()}
        onRetry={vi.fn()}
        onViewProfile={vi.fn()}
      />,
    )
    expect(screen.getAllByTestId('org-connector').length).toBeGreaterThan(0)
    expect(screen.getByText('Alice A')).toBeTruthy()
    expect(screen.getByText('Bob B')).toBeTruthy()
  })
})
