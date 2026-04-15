import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { AgentInlineAction } from './agent-inline-action'
import { AgentContextProvider } from '../context/agent-context-provider'
import { AgentStateProvider } from '../hooks/use-agent-state'

function wrapper({ children }: { children: ReactNode }) {
  return createElement(
    AgentStateProvider,
    null,
    createElement(
      AgentContextProvider,
      { module: 'people', entity: 'employee', id: 'emp-1' },
      children,
    ),
  )
}

describe('AgentInlineAction', () => {
  const actions = [
    { key: 'summarize', label: 'Summarize' },
    { key: 'draft-offboarding', label: 'Draft Offboarding' },
  ]

  it('renders action buttons', () => {
    render(<AgentInlineAction actions={actions} />, { wrapper })
    expect(screen.getByText('Summarize')).toBeDefined()
    expect(screen.getByText('Draft Offboarding')).toBeDefined()
  })

  it('calls onAction when an action is clicked', () => {
    const onAction = vi.fn()
    render(<AgentInlineAction actions={actions} onAction={onAction} />, { wrapper })
    fireEvent.click(screen.getByText('Summarize'))
    expect(onAction).toHaveBeenCalledWith('summarize', {
      module: 'people',
      entity: 'employee',
      id: 'emp-1',
      metadata: undefined,
    })
  })

  it('renders nothing when no actions provided', () => {
    const { container } = render(<AgentInlineAction actions={[]} />, { wrapper })
    expect(container.firstElementChild?.children.length ?? 0).toBe(0)
  })

  it('uses Sparkles icon as fallback when no icon provided', () => {
    render(<AgentInlineAction actions={[{ key: 'test', label: 'Test' }]} />, { wrapper })
    const button = screen.getByText('Test').closest('button')
    expect(button?.querySelector('svg')).not.toBeNull()
  })
})
