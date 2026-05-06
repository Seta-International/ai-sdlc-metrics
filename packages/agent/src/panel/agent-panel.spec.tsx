import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentStateProvider } from '../hooks/use-agent-state'
import { AgentContextProvider } from '../context/agent-context-provider'
import { AgentPanel } from './agent-panel'

vi.mock('../runtime/agent-chat-adapter', () => ({
  createAgentChatAdapter: () => ({ async *run() {} }),
}))

vi.mock('@assistant-ui/react', async (orig) => {
  const real = (await orig()) as Record<string, unknown>
  return {
    ...real,
    useLocalRuntime: () => ({ unstable_synchronizer: () => () => {} }),
    AssistantRuntimeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }
})

vi.mock('../thread/agent-thread', () => ({
  AgentThread: () => <div data-testid="agent-thread-empty" />,
}))
vi.mock('../thread/agent-composer', () => ({
  AgentComposer: () => <textarea aria-label="send" />,
}))

const wrap = (children: React.ReactNode) => (
  <AgentStateProvider>
    <AgentContextProvider module="planner" entity="Refactor token export pipeline" id="t1">
      {children}
    </AgentContextProvider>
  </AgentStateProvider>
)

describe('AgentPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders header, meta strip, and composer', () => {
    render(wrap(<AgentPanel />))
    expect(screen.getByText('Action Intelligence')).toBeTruthy()
    expect(screen.getByText(/flow_/)).toBeTruthy()
  })

  it('shows task context from AgentContext.entity', () => {
    render(wrap(<AgentPanel />))
    expect(screen.getByText(/Refactor token export pipeline/)).toBeTruthy()
  })

  it('shows the rail when localStorage indicates collapsed', () => {
    localStorage.setItem('agent-panel-collapsed:planner', '1')
    render(wrap(<AgentPanel />))
    expect(screen.getByTestId('agent-chat-rail')).toBeTruthy()
    expect(screen.queryByText('Action Intelligence')).toBeNull()
  })

  it('expand button toggles localStorage and shows full panel', () => {
    localStorage.setItem('agent-panel-collapsed:planner', '1')
    render(wrap(<AgentPanel />))
    fireEvent.click(screen.getByRole('button', { name: 'Expand panel' }))
    expect(localStorage.getItem('agent-panel-collapsed:planner')).toBeNull()
    expect(screen.getByText('Action Intelligence')).toBeTruthy()
  })
})
