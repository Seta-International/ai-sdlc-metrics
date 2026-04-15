import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AgentMessageInput } from './agent-message-input'

describe('AgentMessageInput', () => {
  it('renders input and send button', () => {
    render(<AgentMessageInput onSend={vi.fn()} />)
    expect(screen.getByPlaceholderText('Ask the agent...')).toBeDefined()
    expect(screen.getByRole('button')).toBeDefined()
  })

  it('calls onSend with input value and clears input', () => {
    const onSend = vi.fn()
    render(<AgentMessageInput onSend={onSend} />)

    const input = screen.getByPlaceholderText('Ask the agent...') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Hello agent' } })
    fireEvent.click(screen.getByRole('button'))

    expect(onSend).toHaveBeenCalledWith('Hello agent')
    expect(input.value).toBe('')
  })

  it('does not send empty messages', () => {
    const onSend = vi.fn()
    render(<AgentMessageInput onSend={onSend} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onSend).not.toHaveBeenCalled()
  })

  it('sends on Enter key', () => {
    const onSend = vi.fn()
    render(<AgentMessageInput onSend={onSend} />)

    const input = screen.getByPlaceholderText('Ask the agent...')
    fireEvent.change(input, { target: { value: 'Hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSend).toHaveBeenCalledWith('Hello')
  })

  it('disables input when disabled prop is true', () => {
    render(<AgentMessageInput onSend={vi.fn()} disabled />)
    expect((screen.getByPlaceholderText('Ask the agent...') as HTMLInputElement).disabled).toBe(
      true,
    )
  })
})
