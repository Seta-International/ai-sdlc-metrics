import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AgentProvider } from './agent-provider'
import { useAgentState } from './hooks/use-agent-state'

function StateReader() {
  const state = useAgentState()
  return (
    <div>
      <span data-testid="panel-open">{String(state.panelOpen)}</span>
      <span data-testid="session-id">{String(state.activeSessionId)}</span>
      <span data-testid="insights-count">{state.insights.length}</span>
    </div>
  )
}

describe('AgentProvider', () => {
  it('provides AgentStateProvider to children', () => {
    render(
      <AgentProvider>
        <StateReader />
      </AgentProvider>,
    )
    expect(screen.getByTestId('panel-open').textContent).toBe('false')
    expect(screen.getByTestId('session-id').textContent).toBe('null')
    expect(screen.getByTestId('insights-count').textContent).toBe('0')
  })

  it('renders children', () => {
    render(
      <AgentProvider>
        <div data-testid="child">Hello</div>
      </AgentProvider>,
    )
    expect(screen.getByTestId('child').textContent).toBe('Hello')
  })
})
