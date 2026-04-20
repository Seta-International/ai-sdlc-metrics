import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react'
import type { ChatModelAdapter } from '@assistant-ui/react'
import { AgentComposer } from './agent-composer'

const noopAdapter: ChatModelAdapter = { async *run() {} }

function RuntimeWrapper({ children }: { children: React.ReactNode }) {
  const runtime = useLocalRuntime(noopAdapter)
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}

describe('AgentComposer', () => {
  it('renders textarea input', () => {
    render(<AgentComposer />, { wrapper: RuntimeWrapper })
    expect(screen.getByRole('textbox')).toBeDefined()
  })

  it('renders send button', () => {
    render(<AgentComposer />, { wrapper: RuntimeWrapper })
    expect(screen.getByRole('button', { name: /send/i })).toBeDefined()
  })
})
