import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AgentStrip } from './agent-strip'
import { AgentStateProvider, useAgentState } from '../hooks/use-agent-state'
import type { AgentInsight } from '../types'
import { useEffect } from 'react'
import type { ReactNode } from 'react'

const mockInsights: AgentInsight[] = [
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
    title: 'Contract expired',
    description: 'Contract expired yesterday',
    createdAt: new Date(),
  },
  {
    id: '3',
    module: 'projects',
    entity: 'project',
    entityId: 'proj-1',
    severity: 'info',
    title: 'Staffing gap',
    description: 'Project understaffed',
    createdAt: new Date(),
  },
]

function InsightSeeder({ insights, children }: { insights: AgentInsight[]; children: ReactNode }) {
  const { setInsights } = useAgentState()
  useEffect(() => {
    setInsights(insights)
  }, [])
  return <>{children}</>
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AgentStateProvider>
      <InsightSeeder insights={mockInsights}>{children}</InsightSeeder>
    </AgentStateProvider>
  )
}

function emptyWrapper({ children }: { children: ReactNode }) {
  return <AgentStateProvider>{children}</AgentStateProvider>
}

describe('AgentStrip', () => {
  it('shows total insight count', async () => {
    render(<AgentStrip />, { wrapper })
    await waitFor(() => {
      expect(screen.getByText(/3 insights/)).toBeDefined()
    })
  })

  it('groups insights by module', async () => {
    render(<AgentStrip />, { wrapper })
    await waitFor(() => {
      expect(screen.getByText(/People/)).toBeDefined()
      expect(screen.getByText(/Projects/)).toBeDefined()
    })
  })

  it('renders nothing when no insights', () => {
    const { container } = render(<AgentStrip />, { wrapper: emptyWrapper })
    expect(container.firstChild).toBeNull()
  })

  it('uses dark surface tokens', async () => {
    const { container } = render(<AgentStrip />, { wrapper })
    await waitFor(() => {
      const el = container.firstChild as HTMLElement | null
      expect(el?.className).toMatch(/bg-sidebar/)
    })
  })
})
