import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AgentInlineResponse } from './agent-inline-response'

describe('AgentInlineResponse', () => {
  it('renders the content', () => {
    render(<AgentInlineResponse content="Agent response here" onDismiss={vi.fn()} />)
    expect(screen.getByText('Agent response here')).toBeDefined()
  })

  it('shows streaming cursor when isStreaming is true', () => {
    const { container } = render(
      <AgentInlineResponse content="Loading..." isStreaming onDismiss={vi.fn()} />,
    )
    // The streaming cursor is a span with animate-pulse
    const cursor = container.querySelector('.animate-pulse')
    expect(cursor).not.toBeNull()
  })

  it('does not show streaming cursor when isStreaming is false', () => {
    const { container } = render(
      <AgentInlineResponse content="Done" isStreaming={false} onDismiss={vi.fn()} />,
    )
    expect(container.querySelector('.animate-pulse')).toBeNull()
  })

  it('calls onDismiss when dismiss button is clicked', () => {
    const onDismiss = vi.fn()
    render(<AgentInlineResponse content="Hello" onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('shows Continue in panel button when onContinueInPanel is provided and not streaming', () => {
    const onContinueInPanel = vi.fn()
    render(
      <AgentInlineResponse
        content="Done"
        onDismiss={vi.fn()}
        onContinueInPanel={onContinueInPanel}
      />,
    )
    const continueBtn = screen.getByText(/continue in panel/i)
    expect(continueBtn).toBeDefined()
    fireEvent.click(continueBtn)
    expect(onContinueInPanel).toHaveBeenCalledOnce()
  })

  it('hides Continue in panel button when isStreaming is true', () => {
    render(
      <AgentInlineResponse
        content="Loading..."
        isStreaming
        onDismiss={vi.fn()}
        onContinueInPanel={vi.fn()}
      />,
    )
    expect(screen.queryByText(/continue in panel/i)).toBeNull()
  })
})
