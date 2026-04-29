import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LinkExistingRosterForm } from './link-existing-roster-form'

describe('<LinkExistingRosterForm />', () => {
  it('renders roster ID input and submit button', () => {
    render(<LinkExistingRosterForm isSubmitting={false} error={null} onSubmit={vi.fn()} />)
    expect(screen.getByLabelText(/Roster ID/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Link Roster/i })).toBeInTheDocument()
  })

  it('shows error alert when error provided', () => {
    render(
      <LinkExistingRosterForm isSubmitting={false} error="Something failed" onSubmit={vi.fn()} />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Something failed')
  })
})
