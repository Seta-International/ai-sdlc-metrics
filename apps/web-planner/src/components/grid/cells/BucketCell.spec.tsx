import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import type { TaskFlat } from '@future/api-client/planner'
import { BucketCell } from './BucketCell'

function makeFlat(overrides: Partial<TaskFlat> = {}): TaskFlat {
  return {
    id: 't',
    planId: 'p',
    bucketId: 'b',
    bucketName: 'Todo',
    bucketOrderHint: '0|a:',
    title: 't',
    progress: 'not-started',
    priority: 'medium',
    startDate: null,
    dueDate: null,
    assignees: [],
    labels: [],
    orderHint: '0|a:',
    commentCount: 0,
    attachmentCount: 0,
    checklistCount: { total: 0, completed: 0 },
    createdAt: '2026-04-20T00:00Z',
    updatedAt: '2026-04-20T00:00Z',
    ...overrides,
  }
}

describe('BucketCell', () => {
  it('renders the bucket name', () => {
    render(<BucketCell task={makeFlat()} />)
    expect(screen.getByText('Todo')).toBeInTheDocument()
  })

  it('renders PersonalPlanBadge when task.planName is present', () => {
    const t = { ...makeFlat(), planName: 'Alpha', planKind: 'team' } as TaskFlat
    render(<BucketCell task={t} />)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
  })

  it('does not render a badge for standard TaskFlat', () => {
    render(<BucketCell task={makeFlat()} />)
    expect(screen.queryByLabelText(/team plan|personal plan/i)).not.toBeInTheDocument()
  })
})
