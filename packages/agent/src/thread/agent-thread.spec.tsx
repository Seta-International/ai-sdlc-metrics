import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react'
import type { ChatModelAdapter } from '@assistant-ui/react'
import { AgentThread } from './agent-thread'
import { useAgentTurnStore } from '../runtime/agent-turn-store'

const noopAdapter: ChatModelAdapter = {
  async *run() {
    /* no-op for tests */
  },
}

function RuntimeWrapper({ children }: { children: React.ReactNode }) {
  const runtime = useLocalRuntime(noopAdapter)
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}

describe('AgentThread', () => {
  beforeEach(() => {
    useAgentTurnStore.getState().reset()
  })

  it('renders the thread container', () => {
    const { container } = render(<AgentThread />, { wrapper: RuntimeWrapper })
    expect(container.firstChild).toBeTruthy()
  })

  it('shows empty state when no messages', async () => {
    render(<AgentThread />, { wrapper: RuntimeWrapper })
    expect(await screen.findByTestId('agent-thread-empty')).toBeDefined()
  })

  it('renders citation block when citations are present', async () => {
    render(<AgentThread />, { wrapper: RuntimeWrapper })

    act(() => {
      useAgentTurnStore.getState().dispatch({
        seq: 1,
        type: 'answer.complete',
        payload: {
          shape: 'short-answer',
          content: 'Employees get 15 days.',
          citations: [
            { documentTitle: 'Annual Leave Policy', excerpt: 'Employees accrue 15 days annually.' },
          ],
        },
      })
    })

    expect(screen.getByText('Sources (1)')).toBeDefined()
    expect(screen.getByText('Annual Leave Policy')).toBeDefined()
    expect(screen.getByText('Employees accrue 15 days annually.')).toBeDefined()
  })

  it('does not render citation block when citations are empty', () => {
    render(<AgentThread />, { wrapper: RuntimeWrapper })
    expect(screen.queryByText(/Sources/)).toBeNull()
  })
})
