// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SuggestionChip } from './suggestion-chip'

vi.mock('@assistant-ui/react', () => ({
  ThreadPrimitive: {
    Suggestion: ({
      children,
      prompt,
      send,
      clearComposer,
      ...props
    }: React.ComponentProps<'button'> & {
      prompt: string
      send?: boolean
      clearComposer?: boolean
    }) => (
      <button
        type="button"
        data-prompt={prompt}
        data-send={String(send)}
        data-clear-composer={String(clearComposer)}
        {...props}
      >
        {children}
      </button>
    ),
  },
}))

describe('SuggestionChip', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders text and submits the suggestion prompt', () => {
    const onPick = vi.fn()

    render(<SuggestionChip text="What's slipping?" onPick={onPick} />)

    fireEvent.click(screen.getByRole('button', { name: "What's slipping?" }))

    const button = screen.getByRole('button', { name: "What's slipping?" })

    expect(onPick).toHaveBeenCalledOnce()
    expect(button.getAttribute('data-prompt')).toBe("What's slipping?")
    expect(button.getAttribute('data-send')).toBe('true')
    expect(button.getAttribute('data-clear-composer')).toBe('true')
  })
})
