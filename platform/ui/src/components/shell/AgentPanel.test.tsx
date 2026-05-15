import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SetaUIMessage } from '../../lib/chunksToUIMessages'
import { AgentPanel } from './AgentPanel'

const agentMsg: SetaUIMessage = {
  id: '1',
  role: 'assistant',
  parts: [{ type: 'text', text: 'hi', state: 'done' }],
}

describe('AgentPanel', () => {
  it('renders header, messages, and input', () => {
    render(
      <AgentPanel
        agentContext={{ page: 'runs', tenantId: 't1' }}
        messages={[agentMsg]}
        onClose={() => {}}
        onSubmit={() => {}}
      />,
    )
    expect(screen.getByText('Seta Agent')).toBeInTheDocument()
    expect(screen.getByText('hi')).toBeInTheDocument()
    expect(screen.getByLabelText('Message agent')).toBeInTheDocument()
  })

  it('emits onClose when close clicked', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onClose = vi.fn()
    render(
      <AgentPanel
        agentContext={{ page: 'runs' }}
        messages={[]}
        onClose={onClose}
        onSubmit={() => {}}
      />,
    )
    await user.click(screen.getByLabelText('Close agent panel'))
    expect(onClose).toHaveBeenCalled()
  })

  it('emits onSubmit with context on Enter in textarea', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onSubmit = vi.fn()
    render(
      <AgentPanel
        agentContext={{ page: 'runs' }}
        messages={[]}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    )
    await user.type(screen.getByLabelText('Message agent'), 'hi')
    await user.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('hi', { page: 'runs' })
  })
})
