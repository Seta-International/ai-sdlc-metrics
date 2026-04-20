import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MyDayEmptyState } from './my-day-empty-state'

describe('MyDayEmptyState', () => {
  it('renders the spec copy', () => {
    render(<MyDayEmptyState />)
    expect(screen.getByText(/nothing scheduled for today/i)).toBeInTheDocument()
    expect(screen.getByText(/focus today/i)).toBeInTheDocument()
  })
})
