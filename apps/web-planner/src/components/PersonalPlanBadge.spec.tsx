import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PersonalPlanBadge } from './PersonalPlanBadge'

describe('PersonalPlanBadge', () => {
  it('renders plan name + folder icon for team plans', () => {
    render(<PersonalPlanBadge planName="Alpha" planKind="team" />)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByLabelText(/team plan/i)).toBeInTheDocument()
  })

  it('renders plan name + user icon for personal plans', () => {
    render(<PersonalPlanBadge planName="Personal" planKind="personal" />)
    expect(screen.getByText('Personal')).toBeInTheDocument()
    expect(screen.getByLabelText(/personal plan/i)).toBeInTheDocument()
  })
})
