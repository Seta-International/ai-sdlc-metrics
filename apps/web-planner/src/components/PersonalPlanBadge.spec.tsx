import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PersonalPlanBadge } from './PersonalPlanBadge'

describe('PersonalPlanBadge', () => {
  it('renders the label and a user icon', () => {
    render(<PersonalPlanBadge />)
    expect(screen.getByText('Personal')).toBeInTheDocument()
    expect(screen.getByTestId('personal-plan-badge')).toBeInTheDocument()
  })
})
