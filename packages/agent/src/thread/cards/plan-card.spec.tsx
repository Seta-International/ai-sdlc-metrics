import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PlanCard } from './plan-card'

describe('PlanCard', () => {
  it('renders topology and abbreviated traceId', () => {
    render(
      <PlanCard
        traceId="abc1234567890"
        conversationId={null}
        topology="bounded"
        phase={1}
        subAgents={[{ domain: 'planner' }]}
      />,
    )
    expect(screen.getByText('bounded')).toBeTruthy()
    expect(screen.getByText(/abc12345…/)).toBeTruthy()
  })

  it('lists every sub-agent', () => {
    render(
      <PlanCard
        traceId="t"
        conversationId={null}
        topology="iterative"
        phase={1}
        subAgents={[{ domain: 'planner' }, { domain: 'people' }]}
      />,
    )
    expect(screen.getByText('planner')).toBeTruthy()
    expect(screen.getByText('people')).toBeTruthy()
  })

  it('shows iteration tag when iteration is set', () => {
    render(
      <PlanCard
        traceId="t"
        conversationId={null}
        topology="iterative"
        phase={1}
        subAgents={[]}
        iteration={3}
      />,
    )
    expect(screen.getByText(/iter 3/)).toBeTruthy()
  })

  it('hides iteration tag when iteration is undefined', () => {
    render(
      <PlanCard traceId="t" conversationId={null} topology="bounded" phase={1} subAgents={[]} />,
    )
    expect(screen.queryByText(/iter /)).toBeNull()
  })

  it('shows phase label when phase is set', () => {
    render(
      <PlanCard traceId="t" conversationId={null} topology="bounded" phase={1} subAgents={[]} />,
    )
    expect(screen.getByText('router')).toBeTruthy()
  })
})
