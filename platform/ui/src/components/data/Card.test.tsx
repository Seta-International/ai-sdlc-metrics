import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card } from './Card'

describe('Card', () => {
  it('renders content and default styling', () => {
    render(<Card data-testid="c">Hello</Card>)
    const c = screen.getByTestId('c')
    expect(c).toHaveTextContent('Hello')
    expect(c).toHaveClass('rounded-lg')
    expect(c).toHaveClass('bg-canvas')
  })
  it('inset variant uses canvas-soft', () => {
    render(
      <Card variant="inset" data-testid="c">
        x
      </Card>,
    )
    expect(screen.getByTestId('c')).toHaveClass('bg-canvas-soft')
  })
  it('dark variant uses sidebar-bg', () => {
    render(
      <Card variant="dark" data-testid="c">
        x
      </Card>,
    )
    expect(screen.getByTestId('c')).toHaveClass('bg-sidebar-bg')
  })
})
