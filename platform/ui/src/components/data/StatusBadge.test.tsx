import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusBadge } from './StatusBadge'

describe('StatusBadge', () => {
  it.each([
    'success',
    'warning',
    'error',
    'info',
    'neutral',
  ] as const)('renders %s variant with pill rounding', (variant) => {
    render(<StatusBadge variant={variant}>{variant}</StatusBadge>)
    const el = screen.getByText(variant)
    expect(el).toHaveClass('rounded-pill')
    expect(el).toHaveClass(`text-${variant}`)
    expect(el).toHaveClass(`bg-${variant}-soft`)
  })

  it('uses eyebrow typography (11px, +0.4px tracking)', () => {
    render(<StatusBadge variant="info">x</StatusBadge>)
    expect(screen.getByText('x')).toHaveClass('tracking-wider')
  })
})
