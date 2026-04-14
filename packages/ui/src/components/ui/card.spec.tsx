import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from './card'

describe('Card', () => {
  it('renders Card with all sub-components without error', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
          <CardAction>Action</CardAction>
        </CardHeader>
        <CardContent>Content</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    )
    expect(screen.getByText('Title')).toBeInTheDocument()
    expect(screen.getByText('Content')).toBeInTheDocument()
    expect(screen.getByText('Footer')).toBeInTheDocument()
  })

  it('passes data-slot="card" on Card root', () => {
    const { container } = render(<Card>body</Card>)
    expect(container.firstChild).toHaveAttribute('data-slot', 'card')
  })

  it('does not render a shadow class', () => {
    const { container } = render(<Card>body</Card>)
    expect((container.firstChild as HTMLElement).className).not.toContain('shadow')
  })
})
