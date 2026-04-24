// @ts-expect-error -- test-only dependency is not installed in apps/web-admin in this workspace
import { render, screen } from '@testing-library/react'
// @ts-expect-error -- test-only dependency is not installed in apps/web-admin in this workspace
import userEvent from '@testing-library/user-event'
// @ts-expect-error -- test-only dependency is not installed in apps/web-admin in this workspace
import { describe, expect, it, vi } from 'vitest'
import { ConnectForm } from './connect-form'

function setup(onSubmit = vi.fn()) {
  const user = userEvent.setup()
  render(<ConnectForm onSubmit={onSubmit} isSubmitting={false} error={null} />)
  return { user, onSubmit }
}

describe('<ConnectForm />', () => {
  it('renders three inputs and submit', () => {
    setup()

    expect(screen.getByLabelText(/Tenant \(directory\) ID/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Application \(client\) ID/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Client secret/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Test & Save/i })).toBeInTheDocument()
  })

  it('calls onSubmit with trimmed values', async () => {
    const { user, onSubmit } = setup()

    await user.type(
      screen.getByLabelText(/Tenant \(directory\) ID/i),
      ' 11111111-1111-1111-1111-111111111111 ',
    )
    await user.type(
      screen.getByLabelText(/Application \(client\) ID/i),
      ' 22222222-2222-2222-2222-222222222222 ',
    )
    await user.type(screen.getByLabelText(/Client secret/i), ' shhhh ')
    await user.click(screen.getByRole('button', { name: /Test & Save/i }))

    expect(onSubmit).toHaveBeenCalledWith({
      tenantAdId: '11111111-1111-1111-1111-111111111111',
      clientId: '22222222-2222-2222-2222-222222222222',
      clientSecret: 'shhhh',
    })
  })

  it('shows error prominently when provided', () => {
    render(<ConnectForm onSubmit={vi.fn()} isSubmitting={false} error="401 Unauthorized" />)
    expect(screen.getByRole('alert')).toHaveTextContent('401 Unauthorized')
  })
})
