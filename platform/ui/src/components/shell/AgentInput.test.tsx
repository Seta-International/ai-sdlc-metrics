import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AgentInput } from './AgentInput'

describe('AgentInput', () => {
  it('submits on Enter, not on Shift+Enter', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onSubmit = vi.fn()
    render(<AgentInput onSubmit={onSubmit} />)
    const ta = screen.getByLabelText('Message agent')
    await user.type(ta, 'hello')
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(onSubmit).not.toHaveBeenCalled()
    await user.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('hello\n')
  })

  it('disables send button when value is empty', () => {
    render(<AgentInput onSubmit={() => {}} />)
    expect(screen.getByLabelText('Send message')).toBeDisabled()
  })

  it('disables input + button when pending', () => {
    render(<AgentInput onSubmit={() => {}} pending />)
    expect(screen.getByLabelText('Message agent')).toBeDisabled()
    expect(screen.getByLabelText('Send message')).toBeDisabled()
  })
})
