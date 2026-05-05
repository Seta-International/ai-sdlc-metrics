import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Tag } from './tag'

describe('Tag', () => {
  it('renders children inside an uppercase pill', () => {
    render(<Tag>live</Tag>)
    const el = screen.getByText('live')
    expect(el).toBeTruthy()
    expect(el.className).toMatch(/uppercase/)
  })

  it('applies the variant class for "success"', () => {
    render(<Tag variant="success">ok</Tag>)
    const el = screen.getByText('ok')
    expect(el.className).toMatch(/text-emerald|text-green/)
  })

  it('applies the variant class for "warning"', () => {
    render(<Tag variant="warning">warn</Tag>)
    const el = screen.getByText('warn')
    expect(el.className).toMatch(/text-amber|text-yellow/)
  })
})
