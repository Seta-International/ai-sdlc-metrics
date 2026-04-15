import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AgentBanner } from './agent-banner'
import { AgentStateProvider, useAgentState } from '../hooks/use-agent-state'
import { AgentContextProvider } from '../context/agent-context-provider'
import type { AgentInsight } from '../types'
import { useEffect } from 'react'
import type { ReactNode } from 'react'

const insights: AgentInsight[] = [
  {
    id: '1',
    module: 'people',
    entity: 'employee',
    entityId: 'emp-1',
    severity: 'warning',
    title: 'Visa expiring soon',
    description: 'Employee visa expires in 30 days. Consider starting renewal.',
    actionLabel: 'Draft renewal',
    actionHref: '/employees/emp-1/visa',
    createdAt: new Date(),
  },
]

function InsightSeeder({ children }: { children: ReactNode }) {
  const { setInsights } = useAgentState()
  useEffect(() => {
    setInsights(insights)
  }, [])
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

describe('AgentBanner', () => {
  it('shows the highest severity insight for current entity', async () => {
    render(<AgentBanner />, { wrapper })
    await waitFor(() => {
      expect(screen.getByText('Visa expiring soon')).toBeDefined()
      expect(screen.getByText(/visa expires in 30 days/i)).toBeDefined()
    })
  })

  it('shows action link when available', async () => {
    render(<AgentBanner />, { wrapper })
    await waitFor(() => {
      expect(screen.getByText('Draft renewal')).toBeDefined()
    })
  })

  it('can be dismissed', async () => {
    render(<AgentBanner />, { wrapper })
    await waitFor(() => {
      expect(screen.getByText('Visa expiring soon')).toBeDefined()
    })
    const dismissButton = screen.getByRole('button')
    fireEvent.click(dismissButton)
    expect(screen.queryByText('Visa expiring soon')).toBeNull()
  })
})
