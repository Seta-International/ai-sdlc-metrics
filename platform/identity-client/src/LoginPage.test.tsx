import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LoginPage } from './LoginPage'

function mockFetchSequence(
  handlers: Array<(url: string, init?: RequestInit) => Response>,
): typeof fetch {
  let i = 0
  return ((url, init) => {
    const h = handlers[i++]
    if (!h) throw new Error('unexpected extra fetch')
    return Promise.resolve(h(url as string, init as RequestInit))
  }) as typeof fetch
}

describe('LoginPage State A (no last-login cookie)', () => {
  let originalFetch: typeof fetch
  beforeEach(() => {
    originalFetch = globalThis.fetch
    Object.defineProperty(document, 'cookie', { value: '', configurable: true, writable: true })
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true })
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('shows email input; discover hit then start navigates', async () => {
    globalThis.fetch = mockFetchSequence([
      () =>
        new Response(
          JSON.stringify({ ok: true, provider: 'entra', tenantSlug: 'acme', displayName: 'Acme' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      () =>
        new Response(JSON.stringify({ url: 'https://login.microsoftonline.com/x' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ])
    render(<LoginPage returnTo="/" />)
    const input = screen.getByLabelText(/work email/i)
    await userEvent.type(input, 'alice@acme.com')
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() =>
      expect(window.location.href).toMatch(/^https:\/\/login\.microsoftonline\.com/),
    )
  })

  it('shows an error on discover miss', async () => {
    globalThis.fetch = mockFetchSequence([
      () =>
        new Response(JSON.stringify({ ok: false, error: 'no_workspace_for_email' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ])
    render(<LoginPage returnTo="/" />)
    await userEvent.type(screen.getByLabelText(/work email/i), 'alice@unknown.test')
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/no workspace/i)
  })
})

describe('LoginPage State B (last-login cookie present)', () => {
  beforeEach(() => {
    const payload = {
      email: 'alice@acme.com',
      provider: 'entra',
      tenantDisplayName: 'Acme',
      ts: 1700000000,
    }
    const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
    Object.defineProperty(document, 'cookie', {
      get: () => `seta_last_login=${b64}.mac`,
      configurable: true,
    })
  })

  it('renders "Continue as <email>" primary button', () => {
    render(<LoginPage returnTo="/" />)
    expect(screen.getByRole('button', { name: /continue as alice@acme\.com/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /use a different account/i })).toBeInTheDocument()
  })
})

describe('LoginPage magic-link recovery', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'cookie', { value: '', configurable: true, writable: true })
  })
  it('shows a "Can\'t sign in?" link to /login/magic', () => {
    render(<LoginPage returnTo="/" />)
    const link = screen.getByRole('link', { name: /can'?t sign in/i })
    expect(link).toHaveAttribute('href', '/login/magic')
  })
})
