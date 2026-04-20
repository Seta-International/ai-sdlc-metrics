import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react'
import type { ChatModelAdapter } from '@assistant-ui/react'
import { AgentThread } from './agent-thread'

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
  it('renders the thread container', () => {
    const { container } = render(<AgentThread />, { wrapper: RuntimeWrapper })
    expect(container.firstChild).toBeTruthy()
  })

  it('shows empty state when no messages', async () => {
    render(<AgentThread />, { wrapper: RuntimeWrapper })
    expect(await screen.findByTestId('agent-thread-empty')).toBeDefined()
  })
})
