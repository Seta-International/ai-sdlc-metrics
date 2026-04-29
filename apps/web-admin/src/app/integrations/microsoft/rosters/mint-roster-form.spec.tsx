import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MintRosterForm } from './mint-roster-form'

describe('<MintRosterForm />', () => {
  it('renders displayName input and submit button', () => {
    render(<MintRosterForm isSubmitting={false} error={null} onSubmit={vi.fn()} />)

    expect(screen.getByLabelText(/Roster name/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Create Roster/i })).toBeInTheDocument()
  })

  it('shows error alert when error is provided', () => {
    render(<MintRosterForm isSubmitting={false} error="Something went wrong" onSubmit={vi.fn()} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
  })

  it('calls onSubmit with trimmed displayName when submitted', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup({ delay: null })
    render(<MintRosterForm isSubmitting={false} error={null} onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText(/Roster name/i), '  My Roster  ')
    await user.click(screen.getByRole('button', { name: /Create Roster/i }))

    expect(onSubmit).toHaveBeenCalledWith({ displayName: 'My Roster' })
  })
})
