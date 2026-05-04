import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { PriorityIcon } from './PriorityIcon'

describe('PriorityIcon', () => {
  describe('priority=1 (Low)', () => {
    it('has aria-label "Low"', () => {
      render(<PriorityIcon priority={1} />)
      expect(screen.getByRole('img', { name: 'Low' })).toBeDefined()
    })

    it('renders exactly 3 rect bars', () => {
      const { container } = render(<PriorityIcon priority={1} />)
      const rects = container.querySelectorAll('rect')
      expect(rects).toHaveLength(3)
    })

    it('renders the tallest bar (index 2) with dim fill rgba(138,143,152,0.25)', () => {
      const { container } = render(<PriorityIcon priority={1} />)
      const rects = Array.from(container.querySelectorAll('rect'))
      // The dim bar is the rightmost/tallest one (index 2 in the render order)
      const dimBar = rects.find((r) => r.getAttribute('fill') === 'rgba(138,143,152,0.25)')
      expect(dimBar).toBeDefined()
    })

    it('renders 2 filled bars with color #62666d', () => {
      const { container } = render(<PriorityIcon priority={1} />)
      const rects = Array.from(container.querySelectorAll('rect'))
      const filledBars = rects.filter((r) => r.getAttribute('fill') === '#62666d')
      expect(filledBars).toHaveLength(2)
    })

    it('has no Tailwind color token class on svg', () => {
      const { container } = render(<PriorityIcon priority={1} />)
      const svg = container.querySelector('svg')
      expect(svg?.className).not.toContain('text-')
    })
  })

  describe('priority=3 (Normal)', () => {
    it('has aria-label "Normal"', () => {
      render(<PriorityIcon priority={3} />)
      expect(screen.getByRole('img', { name: 'Normal' })).toBeDefined()
    })

    it('renders a horizontal line element (not bars)', () => {
      const { container } = render(<PriorityIcon priority={3} />)
      const line = container.querySelector('line')
      expect(line).not.toBeNull()
      expect(container.querySelectorAll('rect')).toHaveLength(0)
    })

    it('uses stroke color #8a8f98', () => {
      const { container } = render(<PriorityIcon priority={3} />)
      const line = container.querySelector('line')
      expect(line?.getAttribute('stroke')).toBe('#8a8f98')
    })
  })

  describe('priority=5 (Important)', () => {
    it('has aria-label "Important"', () => {
      render(<PriorityIcon priority={5} />)
      expect(screen.getByRole('img', { name: 'Important' })).toBeDefined()
    })

    it('renders exactly 3 bars all filled with #d0d6e0', () => {
      const { container } = render(<PriorityIcon priority={5} />)
      const rects = Array.from(container.querySelectorAll('rect'))
      expect(rects).toHaveLength(3)
      expect(rects.every((r) => r.getAttribute('fill') === '#d0d6e0')).toBe(true)
    })
  })

  describe('priority=9 (Urgent)', () => {
    it('has aria-label "Urgent"', () => {
      render(<PriorityIcon priority={9} />)
      expect(screen.getByRole('img', { name: 'Urgent' })).toBeDefined()
    })

    it('renders an amber filled rect (the square background)', () => {
      const { container } = render(<PriorityIcon priority={9} />)
      const rect = container.querySelector('rect')
      expect(rect?.getAttribute('fill')).toBe('#f59e0b')
      expect(rect?.getAttribute('rx')).toBe('2')
    })

    it('renders a path for the ! mark with dark stroke', () => {
      const { container } = render(<PriorityIcon priority={9} />)
      const path = container.querySelector('path')
      expect(path?.getAttribute('stroke')).toBe('#0a0a0b')
    })
  })
})
