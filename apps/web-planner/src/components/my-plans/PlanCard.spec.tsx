import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PlanCard } from './PlanCard'

describe('PlanCard', () => {
  const base = {
    id: 'p1',
    name: 'Alpha Team',
    memberCount: 3,
    myRole: 'editor' as const,
    updatedAt: new Date().toISOString(),
    ownerActorId: null,
    isPersonal: false,
  }

  it('renders plan name, member count, role, and links to the board', () => {
    render(<PlanCard plan={base} />)
    expect(screen.getByText('Alpha Team')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('editor')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/plans/p1/board')
  })

  it('renders the personal badge when isPersonal is true', () => {
    render(<PlanCard plan={{ ...base, isPersonal: true, ownerActorId: 'a1' }} />)
    expect(screen.getByLabelText(/personal plan/i)).toBeInTheDocument()
  })
})
