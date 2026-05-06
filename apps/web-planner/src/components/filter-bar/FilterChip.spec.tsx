import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { FilterChip } from './FilterChip'
import type { ViewState } from '@/lib/view-state'

const mockPatch = vi.fn()
const mockState: ViewState = {
  view: 'board',
  groupBy: 'bucket',
  filter: {
    due: undefined,
    priority: [],
    labels: [],
    buckets: [],
    assignees: [],
  },
}

vi.mock('@/lib/hooks/useViewState', () => ({
  useViewState: () => ({ state: mockState, patch: mockPatch, reset: vi.fn(), commit: vi.fn() }),
}))

vi.mock('./FilterPopover', () => ({
  FilterPopover: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'filter-popover' }, children),
}))

const viewStateOpts = { planId: 'plan-1' }
const context = {
  labels: [{ id: 'l1', name: 'Bug', color: '#f00' }],
  members: [{ actorId: 'a1', name: 'Alice' }],
  buckets: [{ id: 'b1', name: 'Backlog' }],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockState.filter = {
    due: undefined,
    priority: [],
    labels: [],
    buckets: [],
    assignees: [],
  }
})

describe('FilterChip — chipLabel', () => {
  it('due: shows "Due: " when filter.due is undefined', () => {
    render(<FilterChip viewStateOpts={viewStateOpts} field="due" context={context} />)
    expect(screen.getByRole('button', { name: /Due:/i })).toBeInTheDocument()
  })

  it('due: shows "Due: today" when filter.due is set', () => {
    mockState.filter.due = 'today'
    render(<FilterChip viewStateOpts={viewStateOpts} field="due" context={context} />)
    expect(screen.getByText('Due: today')).toBeInTheDocument()
  })

  it('priority: shows joined values', () => {
    mockState.filter.priority = ['urgent', 'low']
    render(<FilterChip viewStateOpts={viewStateOpts} field="priority" context={context} />)
    expect(screen.getByText('Priority: urgent, low')).toBeInTheDocument()
  })

  it('labels: shows no count when empty', () => {
    render(<FilterChip viewStateOpts={viewStateOpts} field="labels" context={context} />)
    expect(screen.getByText('Labels')).toBeInTheDocument()
    expect(screen.queryByText(/Labels \(/)).not.toBeInTheDocument()
  })

  it('labels: shows count when non-empty', () => {
    mockState.filter.labels = ['l1', 'l2']
    render(<FilterChip viewStateOpts={viewStateOpts} field="labels" context={context} />)
    expect(screen.getByText('Labels (2)')).toBeInTheDocument()
  })

  it('buckets: shows no count when empty', () => {
    render(<FilterChip viewStateOpts={viewStateOpts} field="buckets" context={context} />)
    expect(screen.getByText('Buckets')).toBeInTheDocument()
    expect(screen.queryByText(/Buckets \(/)).not.toBeInTheDocument()
  })

  it('buckets: shows count when non-empty', () => {
    mockState.filter.buckets = ['b1']
    render(<FilterChip viewStateOpts={viewStateOpts} field="buckets" context={context} />)
    expect(screen.getByText('Buckets (1)')).toBeInTheDocument()
  })

  it('assignees: shows no count when empty', () => {
    render(<FilterChip viewStateOpts={viewStateOpts} field="assignees" context={context} />)
    expect(screen.getByText('Assignees')).toBeInTheDocument()
    expect(screen.queryByText(/Assignees \(/)).not.toBeInTheDocument()
  })

  it('assignees: shows count when non-empty', () => {
    mockState.filter.assignees = ['a1', 'a2', 'a3']
    render(<FilterChip viewStateOpts={viewStateOpts} field="assignees" context={context} />)
    expect(screen.getByText('Assignees (3)')).toBeInTheDocument()
  })
})

describe('FilterChip — clearFilter via clear button', () => {
  it('clears due filter when clear button is clicked', () => {
    mockState.filter.due = 'today'
    render(<FilterChip viewStateOpts={viewStateOpts} field="due" context={context} />)
    fireEvent.click(screen.getByRole('button', { name: /clear filter/i }))
    expect(mockPatch).toHaveBeenCalledWith(
      expect.objectContaining({ filter: expect.objectContaining({ due: undefined }) }),
    )
  })

  it('clears priority filter when clear button is clicked', () => {
    mockState.filter.priority = ['urgent']
    render(<FilterChip viewStateOpts={viewStateOpts} field="priority" context={context} />)
    fireEvent.click(screen.getByRole('button', { name: /clear filter/i }))
    expect(mockPatch).toHaveBeenCalledWith(
      expect.objectContaining({ filter: expect.objectContaining({ priority: [] }) }),
    )
  })

  it('clears labels filter when clear button is clicked', () => {
    mockState.filter.labels = ['l1']
    render(<FilterChip viewStateOpts={viewStateOpts} field="labels" context={context} />)
    fireEvent.click(screen.getByRole('button', { name: /clear filter/i }))
    expect(mockPatch).toHaveBeenCalledWith(
      expect.objectContaining({ filter: expect.objectContaining({ labels: [] }) }),
    )
  })

  it('clears buckets filter when clear button is clicked', () => {
    mockState.filter.buckets = ['b1']
    render(<FilterChip viewStateOpts={viewStateOpts} field="buckets" context={context} />)
    fireEvent.click(screen.getByRole('button', { name: /clear filter/i }))
    expect(mockPatch).toHaveBeenCalledWith(
      expect.objectContaining({ filter: expect.objectContaining({ buckets: [] }) }),
    )
  })

  it('clears assignees filter when clear button is clicked', () => {
    mockState.filter.assignees = ['a1']
    render(<FilterChip viewStateOpts={viewStateOpts} field="assignees" context={context} />)
    fireEvent.click(screen.getByRole('button', { name: /clear filter/i }))
    expect(mockPatch).toHaveBeenCalledWith(
      expect.objectContaining({ filter: expect.objectContaining({ assignees: [] }) }),
    )
  })

  it('calls onRemove when provided and clear button is clicked', () => {
    const onRemove = vi.fn()
    render(
      <FilterChip
        viewStateOpts={viewStateOpts}
        field="due"
        context={context}
        onRemove={onRemove}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /clear filter/i }))
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('does not throw when onRemove is not provided', () => {
    render(<FilterChip viewStateOpts={viewStateOpts} field="due" context={context} />)
    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: /clear filter/i })),
    ).not.toThrow()
  })
})
