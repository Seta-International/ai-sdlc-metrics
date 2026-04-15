import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { AgentPanel } from './agent-panel'
import { AgentStateProvider } from '../hooks/use-agent-state'

function wrapper({ children }: { children: ReactNode }) {
  return createElement(AgentStateProvider, null, children)
}

describe('AgentPanel', () => {
  it('renders panel with data-testid', () => {
    const { container } = render(<AgentPanel />, { wrapper })
    expect(container.querySelector('[data-testid="agent-panel"]')).toBeDefined()
  })

  it('renders message input', () => {
    render(<AgentPanel />, { wrapper })
    expect(screen.getByPlaceholderText('Ask the agent...')).toBeDefined()
  })

  it('shows empty state when no messages', () => {
    render(<AgentPanel />, { wrapper })
    expect(screen.getByText(/start a conversation/i)).toBeDefined()
  })
})
