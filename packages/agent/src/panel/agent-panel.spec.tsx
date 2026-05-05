import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentStateProvider, useAgentState } from '../hooks/use-agent-state'
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

  it('renders an empty placeholder when collapsed (rail slot)', () => {
    function Toggle() {
      const s = useAgentState()
      return <button onClick={() => s.setCollapsed(true)}>collapse</button>
    }
    render(
      wrap(
        <>
          <Toggle />
          <AgentPanel />
        </>,
      ),
    )
    fireEvent.click(screen.getByText('collapse'))
    expect(screen.queryByText('Action Intelligence')).toBeNull()
    expect(screen.getByTestId('agent-panel-rail-slot')).toBeTruthy()
  })
})
