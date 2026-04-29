import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('calls onSubmit with msRosterId and optional displayName when submitted', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup({ delay: null })
    render(<LinkExistingRosterForm isSubmitting={false} error={null} onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText(/Roster ID/i), '  roster-abc  ')
    await user.click(screen.getByRole('button', { name: /Link Roster/i }))

    expect(onSubmit).toHaveBeenCalledWith({ msRosterId: 'roster-abc', displayName: undefined })
  })
})
