// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, it, expect, vi } from 'vitest'
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react'
import type { ChatModelAdapter } from '@assistant-ui/react'
import { QueryClient, QueryClientProvider } from '@future/api-client'
import { AgentThread } from './agent-thread'
import { AgentContextProvider } from '../context/agent-context-provider'

const noopAdapter: ChatModelAdapter = {
  async *run() {
    /* no-op for tests */
  },
}

vi.mock('@future/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@future/api-client')>()
  return {
    ...actual,
    useQuery: () => ({ data: undefined, isLoading: true }),
  }
})

function RuntimeWrapper({ children }: { children: React.ReactNode }) {
  const runtime = useLocalRuntime(noopAdapter)
  const queryClient = new QueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      <AssistantRuntimeProvider runtime={runtime}>
        <AgentContextProvider module="planner" entity="plan" id="plan-1">
          {children}
        </AgentContextProvider>
      </AssistantRuntimeProvider>
    </QueryClientProvider>
  )
}

describe('AgentThread', () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    vi.stubGlobal('scrollTo', vi.fn())
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('renders the thread container', () => {
    const { container } = render(<AgentThread />, { wrapper: RuntimeWrapper })
    expect(container.firstChild).toBeTruthy()
  })

  it('shows idle suggestions when no messages', async () => {
    render(<AgentThread />, { wrapper: RuntimeWrapper })
    expect(await screen.findByTestId('agent-idle-state')).toBeDefined()
  })
})
