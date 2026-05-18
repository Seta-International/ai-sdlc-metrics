import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SsoConfigDetail } from '../../api/sso-admin'
import { SsoConfigForm } from './SsoConfigForm'

const detail: SsoConfigDetail = {
  tenantId: 't',
  provider: 'entra',
  config: { entra_tenant_id: 'tid', client_id: 'cid' },
  enabled: true,
  hasSecret: true,
  domains: ['acme.com'],
  lastTestedAt: null,
  lastTestResult: null,
}

describe('SsoConfigForm', () => {
  it('renders empty fields when no detail provided', () => {
    render(<SsoConfigForm onSave={vi.fn()} onTest={vi.fn()} />)
    expect(screen.getByLabelText(/entra tenant id/i)).toHaveValue('')
    expect(screen.getByLabelText(/client id/i)).toHaveValue('')
  })

  it('renders prefilled values; clientSecret stays empty', () => {
    render(<SsoConfigForm onSave={vi.fn()} onTest={vi.fn()} detail={detail} />)
    expect(screen.getByLabelText(/entra tenant id/i)).toHaveValue('tid')
    expect(screen.getByLabelText(/client id/i)).toHaveValue('cid')
    expect(screen.getByLabelText(/client secret/i)).toHaveValue('')
    expect(screen.getByText(/we never display the existing secret/i)).toBeInTheDocument()
  })

  it('calls onSave with collected values; omits clientSecret when blank', async () => {
    const onSave = vi.fn(async () => {})
    render(<SsoConfigForm onSave={onSave} onTest={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(/entra tenant id/i), 'tid')
    await userEvent.type(screen.getByLabelText(/client id/i), 'cid')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onSave).toHaveBeenCalledWith({
      provider: 'entra',
      config: { entra_tenant_id: 'tid', client_id: 'cid' },
      enabled: true,
    })
  })

  it('includes clientSecret in onSave when typed', async () => {
    const onSave = vi.fn(async () => {})
    render(<SsoConfigForm onSave={onSave} onTest={vi.fn()} detail={detail} />)
    await userEvent.type(screen.getByLabelText(/client secret/i), 'rotated')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ clientSecret: 'rotated' }))
  })

  it('calls onTest', async () => {
    const onTest = vi.fn(async () => {})
    render(<SsoConfigForm onSave={vi.fn()} onTest={onTest} detail={detail} />)
    await userEvent.click(screen.getByRole('button', { name: /test connection/i }))
    expect(onTest).toHaveBeenCalled()
  })

  it('disables Test connection when no detail (new config)', () => {
    render(<SsoConfigForm onSave={vi.fn()} onTest={vi.fn()} />)
    expect(screen.getByRole('button', { name: /test connection/i })).toBeDisabled()
  })

  it('renders redirectUri readonly when provided', () => {
    render(
      <SsoConfigForm
        onSave={vi.fn()}
        onTest={vi.fn()}
        detail={detail}
        redirectUri="https://app.example.com/sso/callback/entra"
      />,
    )
    expect(screen.getByLabelText(/redirect uri/i)).toHaveValue(
      'https://app.example.com/sso/callback/entra',
    )
  })
})
