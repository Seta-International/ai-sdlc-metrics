import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'

const mockBack = vi.fn()
let mockPanelSegment: string | null = null

vi.mock('next/navigation', () => ({
  useSelectedLayoutSegment: () => mockPanelSegment,
  useRouter: () => ({ back: mockBack }),
}))

import BoardLayout from './layout'

describe('BoardLayout', () => {
  beforeEach(() => {
    mockBack.mockReset()
    mockPanelSegment = null
  })

  it('always renders children', () => {
    render(
      <BoardLayout panel={<div>panel</div>}>
        <div data-testid="board-children">content</div>
      </BoardLayout>,
    )
    expect(screen.getByTestId('board-children')).toBeDefined()
  })

  it('does not render modal overlay when no panel segment', () => {
    render(
      <BoardLayout panel={<div>panel</div>}>
        <div>content</div>
      </BoardLayout>,
    )
    expect(screen.queryByTestId('modal-overlay')).toBeNull()
  })

  it('does not render modal container when no panel segment', () => {
    render(
      <BoardLayout panel={<div>panel</div>}>
        <div>content</div>
      </BoardLayout>,
    )
    expect(screen.queryByTestId('modal-container')).toBeNull()
  })

  it('renders modal overlay when panel segment is active', () => {
    mockPanelSegment = 'tasks'
    render(
      <BoardLayout panel={<div>panel</div>}>
        <div>content</div>
      </BoardLayout>,
    )
    expect(screen.getByTestId('modal-overlay')).toBeDefined()
  })

  it('renders modal container centered on screen when panel segment is active', () => {
    mockPanelSegment = 'tasks'
    render(
      <BoardLayout panel={<div>panel</div>}>
        <div>content</div>
      </BoardLayout>,
    )
    expect(screen.getByTestId('modal-container')).toBeDefined()
  })

  it('renders panel content inside modal when segment is active', () => {
    mockPanelSegment = 'tasks'
    render(
      <BoardLayout panel={<div data-testid="panel-content">panel</div>}>
        <div>content</div>
      </BoardLayout>,
    )
    expect(screen.getByTestId('panel-content')).toBeDefined()
  })

  it('modal inner container has a height applied via style', () => {
    mockPanelSegment = 'tasks'
    render(
      <BoardLayout panel={<div>panel</div>}>
        <div>content</div>
      </BoardLayout>,
    )
    const inner = screen.getByTestId('modal-inner')
    expect(inner.style.height).toBeTruthy()
  })

  it('modal inner container has a min-height via style to prevent jerk on tab change', () => {
    mockPanelSegment = 'tasks'
    render(
      <BoardLayout panel={<div>panel</div>}>
        <div>content</div>
      </BoardLayout>,
    )
    const inner = screen.getByTestId('modal-inner')
    expect(inner.style.minHeight).toBeTruthy()
  })

  it('calls router.back when overlay backdrop is clicked', () => {
    mockPanelSegment = 'tasks'
    render(
      <BoardLayout panel={<div>panel</div>}>
        <div>content</div>
      </BoardLayout>,
    )
    fireEvent.click(screen.getByTestId('modal-overlay'))
    expect(mockBack).toHaveBeenCalledOnce()
  })
})
