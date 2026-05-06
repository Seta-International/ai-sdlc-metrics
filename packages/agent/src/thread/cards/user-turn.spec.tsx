import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { UserTurn } from './user-turn'

describe('UserTurn', () => {
  it('renders the user text', () => {
    render(<UserTurn>What is happening?</UserTurn>)
    expect(screen.getByText('What is happening?')).toBeTruthy()
  })

  it('aligns to the right', () => {
    const { container } = render(<UserTurn>x</UserTurn>)
    expect(container.firstChild as HTMLElement).toBeTruthy()
    expect((container.firstChild as HTMLElement).className).toMatch(/justify-end/)
  })
})
