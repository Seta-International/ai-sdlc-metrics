import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from './button'

describe('Button', () => {
  it('renders default variant without error', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('renders primary variant without error', () => {
    render(<Button variant="primary">Primary</Button>)
    expect(screen.getByRole('button', { name: 'Primary' })).toBeInTheDocument()
  })

  it('renders secondary variant without error', () => {
    render(<Button variant="secondary">Secondary</Button>)
    expect(screen.getByRole('button', { name: 'Secondary' })).toBeInTheDocument()
  })

  it('renders ghost variant without error', () => {
    render(<Button variant="ghost">Ghost</Button>)
    expect(screen.getByRole('button', { name: 'Ghost' })).toBeInTheDocument()
  })

  it('renders outline variant without error', () => {
    render(<Button variant="outline">Outline</Button>)
    expect(screen.getByRole('button', { name: 'Outline' })).toBeInTheDocument()
  })

  it('renders destructive variant without error', () => {
    render(<Button variant="destructive">Delete</Button>)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('renders icon variant without error', () => {
    render(
      <Button variant="icon" aria-label="icon action">
        +
      </Button>,
    )
    expect(screen.getByRole('button', { name: 'icon action' })).toBeInTheDocument()
  })

  it('renders link variant without error', () => {
    render(<Button variant="link">Link</Button>)
    expect(screen.getByRole('button', { name: 'Link' })).toBeInTheDocument()
  })

  it('passes data-slot="button" attribute', () => {
    render(<Button>Test</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('data-slot', 'button')
  })

  it('is disabled when disabled prop is passed', () => {
    render(<Button disabled>Disabled</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
