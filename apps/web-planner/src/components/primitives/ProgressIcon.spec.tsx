import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { ProgressIcon } from './ProgressIcon'

describe('ProgressIcon', () => {
  describe('progress=0 (Not started)', () => {
    it('has aria-label "Not started"', () => {
      render(<ProgressIcon progress={0} />)
      expect(screen.getByRole('img', { name: 'Not started' })).toBeDefined()
    })

    it('renders a dashed stroke circle (strokeDasharray="2 2")', () => {
      const { container } = render(<ProgressIcon progress={0} />)
      const circle = container.querySelector('circle')
      expect(circle?.getAttribute('stroke-dasharray')).toBe('2 2')
    })

    it('uses hardcoded color #62666d, not a Tailwind class', () => {
      const { container } = render(<ProgressIcon progress={0} />)
      const svg = container.querySelector('svg')
      expect(svg?.className).not.toContain('text-fg-muted')
      const circle = container.querySelector('circle')
      expect(circle?.getAttribute('stroke')).toBe('#62666d')
    })
  })

  describe('progress=50 (In progress)', () => {
    it('has aria-label "In progress"', () => {
      render(<ProgressIcon progress={50} />)
      expect(screen.getByRole('img', { name: 'In progress' })).toBeDefined()
    })

    it('uses amber fill #f59e0b, not text-brand class', () => {
      const { container } = render(<ProgressIcon progress={50} />)
      const svg = container.querySelector('svg')
      expect(svg?.className).not.toContain('text-brand')
      // The half-fill path uses fill="currentColor" — verify the svg has no color class
      // that could be purple/brand. Instead color is set inline on path/circle.
      const path = container.querySelector('path')
      expect(path?.getAttribute('fill')).toBe('#f59e0b')
    })
  })

  describe('progress=100 (Complete)', () => {
    it('has aria-label "Complete"', () => {
      render(<ProgressIcon progress={100} />)
      expect(screen.getByRole('img', { name: 'Complete' })).toBeDefined()
    })

    it('uses emerald fill #10b981 for circle', () => {
      const { container } = render(<ProgressIcon progress={100} />)
      const circle = container.querySelector('circle')
      expect(circle?.getAttribute('fill')).toBe('#10b981')
    })

    it('uses dark stroke #0a0a0b for checkmark path, not white', () => {
      const { container } = render(<ProgressIcon progress={100} />)
      const path = container.querySelector('path')
      expect(path?.getAttribute('stroke')).toBe('#0a0a0b')
    })
  })
})
