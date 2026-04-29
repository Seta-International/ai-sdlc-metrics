import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SideCard } from './SideCard'

afterEach(() => {
  cleanup()
})

describe('SideCard', () => {
  it('renders the title', () => {
    render(<SideCard title="Completeness">content</SideCard>)
    expect(screen.getByText('Completeness')).toBeTruthy()
  })

  it('renders children', () => {
    render(
      <SideCard title="Reports to">
        <span>Bob Smith</span>
      </SideCard>,
    )
    expect(screen.getByText('Bob Smith')).toBeTruthy()
  })

  it('renders count badge when count prop provided', () => {
    render(
      <SideCard title="Direct reports" count={3}>
        content
      </SideCard>,
    )
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('does not render count when count prop is absent', () => {
    render(<SideCard title="Completeness">content</SideCard>)
    expect(screen.queryByText(/^\d+$/)).toBeNull()
  })
})
