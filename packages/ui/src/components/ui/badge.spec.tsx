import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from './badge'

describe('Badge', () => {
  it('renders neutral variant (default) without error', () => {
    render(<Badge>Label</Badge>)
    expect(screen.getByText('Label')).toBeInTheDocument()
  })

  it('renders success variant without error', () => {
    render(<Badge variant="success">Active</Badge>)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('renders subtle variant without error', () => {
    render(<Badge variant="subtle">v1.2</Badge>)
    expect(screen.getByText('v1.2')).toBeInTheDocument()
  })

  it('renders destructive variant without error', () => {
    render(<Badge variant="destructive">Error</Badge>)
    expect(screen.getByText('Error')).toBeInTheDocument()
  })

  it('renders warning variant without error', () => {
    render(<Badge variant="warning">Warning</Badge>)
    expect(screen.getByText('Warning')).toBeInTheDocument()
  })

  it('renders info variant without error', () => {
    render(<Badge variant="info">Info</Badge>)
    expect(screen.getByText('Info')).toBeInTheDocument()
  })

  it('passes data-slot="badge" attribute', () => {
    const { container } = render(<Badge>Test</Badge>)
    expect(container.firstChild).toHaveAttribute('data-slot', 'badge')
  })
})
