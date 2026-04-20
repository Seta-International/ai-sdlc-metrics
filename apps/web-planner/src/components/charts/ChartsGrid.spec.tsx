import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { ChartsGrid } from './ChartsGrid'
import type { TaskFlat } from '@future/api-client/planner'

// Mock next/navigation
const mockReplace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/plans/abc/charts',
}))

// Mock @future/charts (EChart doesn't work in jsdom)
vi.mock('@future/charts', () => ({
  EChart: ({ onEvents }: any) => {
    // ChartsGrid spec doesn't need to fire ECharts events — just check panels render
    return <canvas data-testid="echart" />
  },
}))

// Mock TrendsSection to avoid deep hook dependencies
vi.mock('./TrendsSection', () => ({
  TrendsSection: ({ enabled }: { planId: string; enabled: boolean }) =>
    enabled ? (
      <section>
        <h2>Trends</h2>
      </section>
    ) : null,
}))

beforeEach(() => {
  mockReplace.mockClear()
})

// fixture — 5 tasks spread across different buckets, priorities, assignees
const fixture: TaskFlat[] = [
  mkTask({ progress: 'not-started', priority: 'urgent', bucketId: 'b1', bucketName: 'Todo' }),
  mkTask({ progress: 'in-progress', priority: 'medium', bucketId: 'b2', bucketName: 'Doing' }),
  mkTask({ progress: 'completed', priority: 'low', bucketId: 'b1', bucketName: 'Todo' }),
  mkTask({
    progress: 'not-started',
    priority: 'important',
    bucketId: 'b3',
    bucketName: 'Done',
    assignees: [{ actorId: 'a1', displayName: 'Ana', avatarUrl: null }],
  }),
  mkTask({
    progress: 'in-progress',
    priority: 'urgent',
    bucketId: 'b2',
    bucketName: 'Doing',
    assignees: [{ actorId: 'a2', displayName: 'Bob', avatarUrl: null }],
  }),
]

function mkTask(overrides: Partial<TaskFlat> = {}): TaskFlat {
  return {
    id: crypto.randomUUID(),
    planId: 'plan-1',
    bucketId: 'bucket-1',
    bucketName: 'To Do',
    bucketOrderHint: 'a0',
    title: 'Test task',
    progress: 'not-started',
    priority: 'medium',
    startDate: null,
    dueDate: null,
    assignees: [],
    labels: [],
    orderHint: 'a0',
    commentCount: 0,
    checklistCount: { total: 0, completed: 0 },
    attachmentCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('ChartsGrid', () => {
  it('renders all 5 snapshot panel headings', () => {
    render(<ChartsGrid planId="abc" tasks={fixture} />)
    expect(screen.getByText('By Progress')).toBeInTheDocument()
    expect(screen.getByText('By Priority')).toBeInTheDocument()
    expect(screen.getByText('By Bucket')).toBeInTheDocument()
    expect(screen.getByText('Workload by Assignee')).toBeInTheDocument()
    // No due dates in fixture — Late and Upcoming sections are hidden
    expect(screen.queryByText('Late')).not.toBeInTheDocument()
  })

  it('shows empty state alert when tasks array is empty', () => {
    render(<ChartsGrid planId="abc" tasks={[]} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/no tasks match/i)
  })

  it('does not render TrendsSection when trendsEnabled is false', () => {
    render(<ChartsGrid planId="abc" tasks={fixture} trendsEnabled={false} />)
    expect(screen.queryByText('Trends')).not.toBeInTheDocument()
  })

  it('renders TrendsSection heading when trendsEnabled is true', () => {
    render(<ChartsGrid planId="abc" tasks={fixture} trendsEnabled={true} />)
    expect(screen.getByText('Trends')).toBeInTheDocument()
  })

  it('renders TrendsSection even when tasks array is empty and trendsEnabled is true', () => {
    render(<ChartsGrid planId="abc" tasks={[]} trendsEnabled={true} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/no tasks match/i)
    expect(screen.getByText('Trends')).toBeInTheDocument()
  })
})
