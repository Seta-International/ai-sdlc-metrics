import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Mono } from './mono'

describe('Mono', () => {
  it('renders children with mono font and small size', () => {
    render(<Mono>flow_abc</Mono>)
    const el = screen.getByText('flow_abc')
    expect(el.className).toMatch(/font-mono/)
    expect(el.className).toMatch(/text-/)
  })

  it('passes through className', () => {
    render(<Mono className="text-accent">x</Mono>)
    const el = screen.getByText('x')
    expect(el.className).toMatch(/text-accent/)
  })
})
