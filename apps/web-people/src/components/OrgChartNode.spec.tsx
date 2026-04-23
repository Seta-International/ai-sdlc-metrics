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
})
