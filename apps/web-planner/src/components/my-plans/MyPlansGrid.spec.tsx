import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MyPlansGrid } from './MyPlansGrid'

describe('MyPlansGrid', () => {
  const actorId = 'a1'
  const personal = {
    id: 'pp',
    name: 'Personal',
    memberCount: 1,
    myRole: 'owner' as const,
    updatedAt: new Date().toISOString(),
    ownerActorId: actorId,
  }
  const teamA = {
    id: 'ta',
    name: 'Alpha',
    memberCount: 3,
    myRole: 'editor' as const,
    updatedAt: new Date().toISOString(),
    ownerActorId: null,
  }
  const teamB = {
    id: 'tb',
    name: 'Beta',
    memberCount: 5,
    myRole: 'viewer' as const,
    updatedAt: new Date().toISOString(),
    ownerActorId: null,
  }

  it('renders personal plan first then team plans alphabetically', () => {
    render(<MyPlansGrid plans={[teamB, teamA, personal]} actorId={actorId} />)
    const grid = screen.getByTestId('my-plans-grid')
    const names = within(grid)
      .getAllByRole('link')
      .map((a) => within(a).getByRole('heading').textContent)
    expect(names).toEqual(['Personal', 'Alpha', 'Beta'])
  })

  it("marks the actor's personal plan card with the personal badge", () => {
    render(<MyPlansGrid plans={[personal, teamA]} actorId={actorId} />)
    expect(screen.getAllByTestId('personal-plan-badge')).toHaveLength(1)
  })
})
