// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IdleState } from './idle-state'

const mockUseQuery = vi.fn()
const mockSuggestionChip = vi.fn()

vi.mock('@future/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@future/api-client')>()

  return {
    ...actual,
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
  }
})

vi.mock('./suggestion-chip', () => ({
  SuggestionChip: ({ text, onPick }: { text: string; onPick: () => void }) => {
    mockSuggestionChip(text)
    return (
      <button type="button" onClick={onPick}>
        {text}
      </button>
    )
  },
}))

describe('IdleState', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    mockUseQuery.mockReset()
    mockSuggestionChip.mockReset()
  })

  it('renders 4 skeletons while loading', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true })

    const { container } = render(<IdleState surface="planner" contextEntity={null} />)

    expect(container.querySelectorAll('[data-testid="suggestion-skeleton"]')).toHaveLength(4)
  })

  it('renders welcome subtext + suggestions when loaded', () => {
    mockUseQuery.mockReturnValue({
      data: {
        welcomeSubtext: 'Hello there',
        suggestions: [
          { slug: 'a', text: 'Try A' },
          { slug: 'b', text: 'Try B' },
        ],
      },
      isLoading: false,
    })

    render(<IdleState surface="planner" contextEntity={null} />)

    expect(screen.getByText('Hello there')).toBeTruthy()
    expect(screen.getByText('Try A')).toBeTruthy()
    expect(screen.getByText('Try B')).toBeTruthy()
  })

  it('uses templated title when contextEntity present', () => {
    mockUseQuery.mockReturnValue({
      data: { welcomeSubtext: 'sub', suggestions: [] },
      isLoading: false,
    })

    render(<IdleState surface="planner" contextEntity="Q1 Launch" />)

    expect(screen.getByText('Ask about Q1 Launch')).toBeTruthy()
  })

  it('falls back to "Ask about this plan" when contextEntity is null', () => {
    mockUseQuery.mockReturnValue({
      data: { welcomeSubtext: 'sub', suggestions: [] },
      isLoading: false,
    })

    render(<IdleState surface="planner" contextEntity={null} />)

    expect(screen.getByText('Ask about this plan')).toBeTruthy()
  })

  it('clicking a suggestion uses the suggestion chip callback', () => {
    mockUseQuery.mockReturnValue({
      data: {
        welcomeSubtext: 'Hello there',
        suggestions: [{ slug: 'a', text: 'Try A' }],
      },
      isLoading: false,
    })

    render(<IdleState surface="planner" contextEntity={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Try A' }))

    expect(mockSuggestionChip).toHaveBeenCalledWith('Try A')
  })
})
