import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProfileCard, KVRow } from './ProfileCard'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ProfileCard', () => {
  it('renders the title', () => {
    render(<ProfileCard title="About">content</ProfileCard>)
    expect(screen.getByText('About')).toBeTruthy()
  })

  it('renders children', () => {
    render(
      <ProfileCard title="About">
        <span>child content</span>
      </ProfileCard>,
    )
    expect(screen.getByText('child content')).toBeTruthy()
  })

  it('renders action button when action prop provided', () => {
    render(
      <ProfileCard title="Job" action={{ label: 'Edit', onClick: vi.fn() }}>
        content
      </ProfileCard>,
    )
    expect(screen.getByText('Edit')).toBeTruthy()
  })

  it('calls action.onClick when action button clicked', async () => {
    const onClick = vi.fn()
    render(
      <ProfileCard title="Job" action={{ label: 'Edit', onClick }}>
        content
      </ProfileCard>,
    )
    await userEvent.click(screen.getByText('Edit'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not render action button when action prop is absent', () => {
    render(<ProfileCard title="About">content</ProfileCard>)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders lock icon and message when locked', () => {
    render(
      <ProfileCard title="Compensation" locked>
        content
      </ProfileCard>,
    )
    expect(screen.getByTestId('lock-icon')).toBeTruthy()
  })
})

describe('KVRow', () => {
  it('renders label and value', () => {
    render(<KVRow label="Job title" value="Senior Engineer" />)
    expect(screen.getByText('Job title')).toBeTruthy()
    expect(screen.getByText('Senior Engineer')).toBeTruthy()
  })

  it('applies mono class when mono prop is true', () => {
    render(<KVRow label="Employee ID" value="E-001" mono />)
    const value = screen.getByText('E-001')
    expect(value.className).toContain('font-mono')
  })

  it('renders em-dash when value is null', () => {
    render(<KVRow label="Middle name" value={null} />)
    expect(screen.getByText('—')).toBeTruthy()
  })
})
