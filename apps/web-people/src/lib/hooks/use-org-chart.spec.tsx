import * as React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useOrgChart } from './use-org-chart'

const { contextQuery, childrenQuery } = vi.hoisted(() => ({
  contextQuery: vi.fn(),
  childrenQuery: vi.fn(),
}))

vi.mock('../trpc', () => ({
  trpc: {
    people: {
      orgChart: {
        context: { query: contextQuery },
        children: { query: childrenQuery },
      },
    },
  },
}))

function Harness() {
  const chart = useOrgChart()
  return (
    <div>
      <div data-testid="loading">{String(chart.isLoadingContext)}</div>
      <div data-testid="error">{chart.contextError ?? ''}</div>
      <div data-testid="nodes">{chart.visibleNodes.map((node) => node.fullName).join(',')}</div>
      <div data-testid="roots">{chart.rootEmploymentIds.join(',')}</div>
      <div data-testid="focus">{chart.focusEmploymentId ?? ''}</div>
      <button type="button" onClick={() => void chart.expandNode('self-1')}>
        expand self
      </button>
      <button type="button" onClick={() => chart.collapseNode('self-1')}>
        collapse self
      </button>
    </div>
  )
}

function ErrorHarness() {
  const chart = useOrgChart()
  return (
    <div>
      <div data-testid="child-error">{chart.childErrorsById.get('self-1') ?? ''}</div>
      <button type="button" onClick={() => void chart.expandNode('self-1')}>
        expand self
      </button>
      <button type="button" onClick={() => void chart.retryChildren('self-1')}>
        retry self
      </button>
    </div>
  )
}

function RetryHarness() {
  const chart = useOrgChart()
  return (
    <div>
      <div data-testid="error">{chart.contextError ?? ''}</div>
      <button type="button" onClick={chart.retryContext}>
        retry context
      </button>
    </div>
  )
}

const self = {
  employmentId: 'self-1',
  personProfileId: 'profile-self',
  fullName: 'Sam Self',
  jobTitle: 'Senior Engineer',
  departmentName: 'Engineering',
  locationName: 'Singapore',
  avatarUrl: null,
  managerEmploymentId: 'manager-1',
  directReportCount: 1,
  hasDirectReports: true,
  relationshipToViewer: 'self' as const,
}

describe('useOrgChart', () => {
  beforeEach(() => {
    contextQuery.mockResolvedValue({
      nodes: [self],
      rootEmploymentIds: ['manager-1'],
      focusEmploymentId: 'self-1',
    })
    childrenQuery.mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('loads context and exposes visible nodes', async () => {
    render(<Harness />)

    expect(screen.getByTestId('loading').textContent).toBe('true')
    await waitFor(() => expect(contextQuery).toHaveBeenCalledTimes(1))

    expect(screen.getByTestId('loading').textContent).toBe('false')
    expect(screen.getByTestId('nodes').textContent).toBe('Sam Self')
    expect(screen.getByTestId('focus').textContent).toBe('self-1')
  })

  it('uses root employment ids from the API when the viewer has no focus node', async () => {
    contextQuery.mockResolvedValueOnce({
      nodes: [
        {
          ...self,
          employmentId: 'root-1',
          fullName: 'Ada Root',
          managerEmploymentId: null,
          relationshipToViewer: 'root',
        },
      ],
      rootEmploymentIds: ['root-1'],
      focusEmploymentId: null,
    })

    render(<Harness />)

    await waitFor(() => expect(screen.getByTestId('nodes').textContent).toContain('Ada Root'))
    expect(screen.getByTestId('roots').textContent).toBe('root-1')
    expect(screen.getByTestId('focus').textContent).toBe('')
  })

  it('lazy-loads children once and keeps cached children after collapse', async () => {
    childrenQuery.mockResolvedValueOnce([
      {
        ...self,
        employmentId: 'report-1',
        personProfileId: 'profile-report',
        fullName: 'Riley Report',
        managerEmploymentId: 'self-1',
        directReportCount: 0,
        hasDirectReports: false,
        relationshipToViewer: undefined,
      },
    ])

    render(<Harness />)
    await waitFor(() => expect(screen.getByTestId('nodes').textContent).toContain('Sam Self'))

    screen.getByRole('button', { name: 'expand self' }).click()
    await waitFor(() => expect(childrenQuery).toHaveBeenCalledWith({ employmentId: 'self-1' }))
    await waitFor(() => expect(screen.getByTestId('nodes').textContent).toContain('Riley Report'))

    screen.getByRole('button', { name: 'collapse self' }).click()
    screen.getByRole('button', { name: 'expand self' }).click()

    expect(childrenQuery).toHaveBeenCalledTimes(1)
  })

  it('retries the whole context request after an initial failure', async () => {
    contextQuery.mockRejectedValueOnce(new Error('Context failed')).mockResolvedValueOnce({
      nodes: [self],
      rootEmploymentIds: ['manager-1'],
      focusEmploymentId: 'self-1',
    })

    render(<RetryHarness />)
    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('Context failed'))

    screen.getByRole('button', { name: 'retry context' }).click()
    await waitFor(() => expect(contextQuery).toHaveBeenCalledTimes(2))
  })

  it('stores per-node child loading errors and retries failed children', async () => {
    childrenQuery.mockRejectedValueOnce(new Error('Branch failed')).mockResolvedValueOnce([])

    render(<ErrorHarness />)
    await waitFor(() => expect(contextQuery).toHaveBeenCalledTimes(1))

    screen.getByRole('button', { name: 'expand self' }).click()
    await waitFor(() => expect(screen.getByTestId('child-error').textContent).toBe('Branch failed'))

    screen.getByRole('button', { name: 'retry self' }).click()
    await waitFor(() => expect(childrenQuery).toHaveBeenCalledTimes(2))
    expect(screen.getByTestId('child-error').textContent).toBe('')
  })
})
