import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'

describe('LoginPage', () => {
  it('renders default Microsoft and Google buttons', () => {
    render(<LoginPage returnTo="/tenants" />)
    expect(screen.getByRole('button', { name: /sign in with microsoft/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument()
  })

  it('honors the providers prop', () => {
    render(<LoginPage providers={['google']} />)
    expect(
      screen.queryByRole('button', { name: /sign in with microsoft/i }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument()
  })

  it('uses a custom title when provided', () => {
    render(<LoginPage title="Welcome back" />)
    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument()
  })

  it('disables both SSO buttons while sign-in is pending', async () => {
    const user = userEvent.setup()
    const fetchImpl = vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch
    render(<LoginPage signInOptions={{ fetch: fetchImpl }} />)

    const msBtn = screen.getByRole('button', { name: /sign in with microsoft/i })
    const googleBtn = screen.getByRole('button', { name: /sign in with google/i })
    await user.click(msBtn)

    expect(msBtn).toBeDisabled()
    expect(googleBtn).toBeDisabled()
  })

  it('shows an error banner when sign-in fails', async () => {
    const user = userEvent.setup()
    const fetchImpl = vi.fn(
      async () => new Response('boom', { status: 500 }),
    ) as unknown as typeof fetch
    render(<LoginPage signInOptions={{ fetch: fetchImpl }} />)

    await user.click(screen.getByRole('button', { name: /sign in with microsoft/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/couldn't sign you in|failed/i)
  })

  it('dismisses the error banner when the close button is clicked', async () => {
    const user = userEvent.setup()
    const fetchImpl = vi.fn(
      async () => new Response('boom', { status: 500 }),
    ) as unknown as typeof fetch
    render(<LoginPage signInOptions={{ fetch: fetchImpl }} />)

    await user.click(screen.getByRole('button', { name: /sign in with microsoft/i }))
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: /dismiss/i }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders the build SHA in the footer when provided', () => {
    render(<LoginPage buildSha="abc1234" />)
    expect(screen.getByText(/abc1234/)).toBeInTheDocument()
  })

  it('renders the logo image when logoUrl is provided', () => {
    render(<LoginPage logoUrl="/console/seta-logo.svg" />)
    const img = screen.getByRole('img', { name: /seta/i })
    expect(img).toHaveAttribute('src', '/console/seta-logo.svg')
  })
})
