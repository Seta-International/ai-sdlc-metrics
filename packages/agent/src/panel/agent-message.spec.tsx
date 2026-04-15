import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AgentMessage } from './agent-message'
import type { AgentMessage as AgentMessageType } from '../types'

describe('AgentMessage', () => {
  const userMessage: AgentMessageType = {
    id: 'msg-1',
    sessionId: 'session-1',
    role: 'user',
    content: 'Summarize this employee',
    createdAt: new Date('2026-04-15T10:00:00Z'),
  }

  const assistantMessage: AgentMessageType = {
    id: 'msg-2',
    sessionId: 'session-1',
    role: 'assistant',
    content: 'Here is the summary of the employee.',
    createdAt: new Date('2026-04-15T10:00:01Z'),
  }

  const toolCallMessage: AgentMessageType = {
    id: 'msg-3',
    sessionId: 'session-1',
    role: 'tool_call',
    content: '',
    toolName: 'people_get_employment_profile',
    toolArgs: { actorId: 'abc-123' },
    createdAt: new Date('2026-04-15T10:00:02Z'),
  }

  it('renders user message with content', () => {
    render(<AgentMessage message={userMessage} />)
    expect(screen.getByText('Summarize this employee')).toBeDefined()
  })

  it('renders assistant message with content', () => {
    render(<AgentMessage message={assistantMessage} />)
    expect(screen.getByText('Here is the summary of the employee.')).toBeDefined()
  })

  it('renders tool call with tool name', () => {
    render(<AgentMessage message={toolCallMessage} />)
    expect(screen.getByText('people_get_employment_profile')).toBeDefined()
  })

  it('applies different styling for user vs assistant', () => {
    const { container: userContainer } = render(<AgentMessage message={userMessage} />)
    const { container: assistantContainer } = render(<AgentMessage message={assistantMessage} />)
    const userDiv = userContainer.firstElementChild
    const assistantDiv = assistantContainer.firstElementChild
    expect(userDiv?.className).not.toBe(assistantDiv?.className)
  })
})
