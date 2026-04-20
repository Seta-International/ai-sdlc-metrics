import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { AgentPanel } from './agent-panel'
import { AgentStateProvider } from '../hooks/use-agent-state'

function wrapper({ children }: { children: ReactNode }) {
  return createElement(AgentStateProvider, null, children)
}

describe('AgentPanel', () => {
  it('renders panel container', () => {
    const { container } = render(<AgentPanel />, { wrapper })
    expect(container.querySelector('[data-testid="agent-panel"]')).toBeDefined()
  })

  it('renders the composer textarea', () => {
    render(<AgentPanel />, { wrapper })
    expect(screen.getByRole('textbox')).toBeDefined()
  })

  it('renders the send button', () => {
    render(<AgentPanel />, { wrapper })
    expect(screen.getByRole('button', { name: /send/i })).toBeDefined()
  })

  it('shows empty state when no messages', async () => {
    render(<AgentPanel />, { wrapper })
    expect(await screen.findByTestId('agent-thread-empty')).toBeDefined()
  })
})
