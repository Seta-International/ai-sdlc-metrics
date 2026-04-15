import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AgentBadge } from './agent-badge'
import { AgentStateProvider, useAgentState } from '../hooks/use-agent-state'
import { AgentContextProvider } from '../context/agent-context-provider'
import type { AgentInsight } from '../types'
import type { ReactNode } from 'react'

const insights: AgentInsight[] = [
  {
    id: '1',
    module: 'people',
    entity: 'employee',
    entityId: 'emp-1',
    severity: 'warning',
    title: 'Visa expiring',
    description: 'Visa expires in 30 days',
    createdAt: new Date(),
  },
  {
    id: '2',
    module: 'people',
    entity: 'employee',
    entityId: 'emp-2',
    severity: 'critical',
    title: 'Other employee issue',
    description: 'Not this entity',
    createdAt: new Date(),
  },
]

function InsightSeeder({ children }: { children: ReactNode }) {
  const { setInsights } = useAgentState()
  setInsights(insights)
  return <>{children}</>
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AgentStateProvider>
      <InsightSeeder>
        <AgentContextProvider module="people" entity="employee" id="emp-1">
          {children}
        </AgentContextProvider>
      </InsightSeeder>
    </AgentStateProvider>
  )
}

function noMatchWrapper({ children }: { children: ReactNode }) {
  return (
    <AgentStateProvider>
      <InsightSeeder>
        <AgentContextProvider module="time" entity="leave-request" id="lr-1">
          {children}
        </AgentContextProvider>
      </InsightSeeder>
    </AgentStateProvider>
  )
}

describe('AgentBadge', () => {
  it('shows count for matching entity insights', () => {
    render(<AgentBadge />, { wrapper })
    expect(screen.getByText('1')).toBeDefined()
  })

  it('renders nothing when no matching insights', () => {
    const { container } = render(<AgentBadge />, { wrapper: noMatchWrapper })
    expect(container.firstChild).toBeNull()
  })
})
