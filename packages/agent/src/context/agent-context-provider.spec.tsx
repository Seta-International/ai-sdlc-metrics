import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AgentContextProvider } from './agent-context-provider'
import { useAgentContext } from './use-agent-context'

function ContextReader() {
  const ctx = useAgentContext()
  if (!ctx) return <div>no context</div>
  return (
    <div>
      <span data-testid="module">{ctx.module}</span>
      <span data-testid="entity">{ctx.entity}</span>
      <span data-testid="id">{ctx.id}</span>
      <span data-testid="metadata">{JSON.stringify(ctx.metadata)}</span>
    </div>
  )
}

describe('AgentContextProvider', () => {
  it('provides context to children', () => {
    render(
      <AgentContextProvider module="people" entity="employee" id="abc-123">
        <ContextReader />
      </AgentContextProvider>,
    )
    expect(screen.getByTestId('module').textContent).toBe('people')
    expect(screen.getByTestId('entity').textContent).toBe('employee')
    expect(screen.getByTestId('id').textContent).toBe('abc-123')
  })

  it('passes metadata to context', () => {
    render(
      <AgentContextProvider
        module="time"
        entity="leave-request"
        id="def-456"
        metadata={{ department: 'Engineering' }}
      >
        <ContextReader />
      </AgentContextProvider>,
    )
    expect(screen.getByTestId('metadata').textContent).toBe('{"department":"Engineering"}')
  })

  it('returns null when no provider is present', () => {
    render(<ContextReader />)
    expect(screen.getByText('no context')).toBeDefined()
  })

  it('nearest provider wins when nested', () => {
    render(
      <AgentContextProvider module="people" entity="employee" id="outer">
        <AgentContextProvider module="time" entity="leave-request" id="inner">
          <ContextReader />
        </AgentContextProvider>
      </AgentContextProvider>,
    )
    expect(screen.getByTestId('module').textContent).toBe('time')
    expect(screen.getByTestId('id').textContent).toBe('inner')
  })
})
