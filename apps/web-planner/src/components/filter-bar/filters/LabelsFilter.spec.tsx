import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LabelsFilter } from './LabelsFilter'
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

const context = {
  labels: [
    { id: 'l1', name: 'Bug', color: '#f00' },
    { id: 'l2', name: 'Feature', color: '#0f0' },
  ],
  members: [],
  buckets: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockState.filter.labels = []
})

describe('LabelsFilter', () => {
  it('renders label items from context', () => {
    render(<LabelsFilter viewStateOpts={{ planId: 'plan-1' }} context={context} />)
    expect(screen.getByText('Bug')).toBeInTheDocument()
    expect(screen.getByText('Feature')).toBeInTheDocument()
  })

  it('shows empty state when no labels in context', () => {
    render(
      <LabelsFilter viewStateOpts={{ planId: 'plan-1' }} context={{ ...context, labels: [] }} />,
    )
    expect(screen.getByText(/no labels found/i)).toBeInTheDocument()
  })

  it('adds label to filter when unselected label is clicked (branch: not included)', () => {
    mockState.filter.labels = []
    render(<LabelsFilter viewStateOpts={{ planId: 'plan-1' }} context={context} />)
    fireEvent.click(screen.getByText('Bug'))
    expect(mockPatch).toHaveBeenCalledWith(
      expect.objectContaining({ filter: expect.objectContaining({ labels: ['l1'] }) }),
    )
  })

  it('removes label from filter when selected label is clicked (branch: already included)', () => {
    mockState.filter.labels = ['l1']
    render(<LabelsFilter viewStateOpts={{ planId: 'plan-1' }} context={context} />)
    fireEvent.click(screen.getByText('Bug'))
    expect(mockPatch).toHaveBeenCalledWith(
      expect.objectContaining({ filter: expect.objectContaining({ labels: [] }) }),
    )
  })

  it('keeps other labels when one is removed', () => {
    mockState.filter.labels = ['l1', 'l2']
    render(<LabelsFilter viewStateOpts={{ planId: 'plan-1' }} context={context} />)
    fireEvent.click(screen.getByText('Bug'))
    expect(mockPatch).toHaveBeenCalledWith(
      expect.objectContaining({ filter: expect.objectContaining({ labels: ['l2'] }) }),
    )
  })
})
