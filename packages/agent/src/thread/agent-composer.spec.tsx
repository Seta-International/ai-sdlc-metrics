import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react'
import type { ChatModelAdapter } from '@assistant-ui/react'
import { AgentComposer } from './agent-composer'
import { AgentStateProvider } from '../hooks/use-agent-state'

const noopAdapter: ChatModelAdapter = { async *run() {} }

function FullWrapper({ children }: { children: React.ReactNode }) {
  const runtime = useLocalRuntime(noopAdapter)
  return (
    <AgentStateProvider>
      <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
    </AgentStateProvider>
  )
}

describe('AgentComposer', () => {
  it('renders textarea input', () => {
    render(<AgentComposer />, { wrapper: FullWrapper })
    expect(screen.getByRole('textbox')).toBeDefined()
  })

  it('renders send button', () => {
    render(<AgentComposer />, { wrapper: FullWrapper })
    expect(screen.getByRole('button', { name: /send/i })).toBeDefined()
  })

  it('renders execution mode combobox', () => {
    render(<AgentComposer />, { wrapper: FullWrapper })
    expect(screen.getByRole('combobox')).toBeDefined()
  })

  it('shows Default approvals label initially', () => {
    render(<AgentComposer />, { wrapper: FullWrapper })
    expect(screen.getAllByText('Default approvals').length).toBeGreaterThan(0)
  })
})
