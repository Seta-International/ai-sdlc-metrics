import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SetaUIMessage } from '../../lib/chunksToUIMessages'
import { AgentMessageList } from './AgentMessageList'

const userMsg: SetaUIMessage = {
  id: '1',
  role: 'user',
  parts: [{ type: 'text', text: 'hi' }],
}
const agentMsg: SetaUIMessage = {
  id: '2',
  role: 'assistant',
  parts: [{ type: 'text', text: 'hello', state: 'done' }],
}
const toolMsg: SetaUIMessage = {
  id: '3',
  role: 'assistant',
  parts: [
    { type: 'text', text: '', state: 'streaming' },
    {
      type: 'dynamic-tool',
      toolName: 'graph.search',
      toolCallId: 'c1',
      state: 'input-available',
      input: { q: 'x' },
    } as SetaUIMessage['parts'][number],
  ],
}

describe('AgentMessageList', () => {
  it('renders user and assistant bubbles distinctly', () => {
    render(<AgentMessageList messages={[userMsg, agentMsg]} />)
    expect(screen.getByText('hi').closest('div')?.className).toMatch(/bg-primary-subtle/)
    expect(screen.getByText('hello').closest('div')?.className).toMatch(/bg-canvas/)
  })

  it('renders tool-call chips with status label', () => {
    render(<AgentMessageList messages={[toolMsg]} />)
    expect(screen.getByText('Calling graph.search')).toBeInTheDocument()
  })

  it('shows streaming indicator when streaming=true', () => {
    render(<AgentMessageList messages={[]} streaming />)
    expect(screen.getByLabelText('Agent is typing')).toBeInTheDocument()
  })
})
