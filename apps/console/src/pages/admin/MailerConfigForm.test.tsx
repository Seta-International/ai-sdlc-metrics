import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { MailerDetail } from '../../api/mailer-admin'
import { MailerConfigForm } from './MailerConfigForm'

const detail: MailerDetail = {
  tenantId: 't',
  provider: 'graph',
  config: { mailbox_user_id: 'noreply@acme.com', from_address: 'noreply@acme.com' },
  enabled: true,
}

describe('MailerConfigForm', () => {
  it('renders empty fields when no detail provided', () => {
    render(<MailerConfigForm onSave={vi.fn()} />)
    expect(screen.getByLabelText(/mailbox/i)).toHaveValue('')
    expect(screen.getByLabelText(/from address/i)).toHaveValue('')
  })

  it('renders prefilled values from detail', () => {
    render(<MailerConfigForm onSave={vi.fn()} detail={detail} />)
    expect(screen.getByLabelText(/mailbox/i)).toHaveValue('noreply@acme.com')
    expect(screen.getByLabelText(/from address/i)).toHaveValue('noreply@acme.com')
  })

  it('calls onSave with collected values', async () => {
    const onSave = vi.fn(async () => {})
    render(<MailerConfigForm onSave={onSave} />)
    await userEvent.type(screen.getByLabelText(/mailbox/i), 'm@x.com')
    await userEvent.type(screen.getByLabelText(/from address/i), 'f@x.com')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onSave).toHaveBeenCalledWith({
      provider: 'graph',
      config: { mailbox_user_id: 'm@x.com', from_address: 'f@x.com' },
      enabled: true,
    })
  })
})
