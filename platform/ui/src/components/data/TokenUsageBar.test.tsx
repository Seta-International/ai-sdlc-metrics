import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TokenUsageBar } from './TokenUsageBar'

describe('TokenUsageBar', () => {
  it('renders tokens in/out with tnum formatting', () => {
    render(<TokenUsageBar tokensIn={1200} tokensOut={340} />)
    expect(screen.getByText('In: 1,200')).toBeInTheDocument()
    expect(screen.getByText('Out: 340')).toBeInTheDocument()
  })

  it('computes proportional bar widths', () => {
    const { container } = render(<TokenUsageBar tokensIn={300} tokensOut={100} />)
    const bars = container.querySelectorAll('[data-bar]')
    expect((bars[0] as HTMLElement).style.width).toBe('75%')
    expect((bars[1] as HTMLElement).style.width).toBe('25%')
  })

  it('handles zero gracefully', () => {
    render(<TokenUsageBar tokensIn={0} tokensOut={0} />)
    expect(screen.getByText('In: 0')).toBeInTheDocument()
    expect(screen.getByText('Out: 0')).toBeInTheDocument()
  })
})
