import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RequireSession } from './RequireSession'

const fetchMock = vi.fn()

const originalLocation = window.location

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  // Reset href before each test
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      ...originalLocation,
      href: 'http://localhost/studio/runs',
      pathname: '/studio/runs',
      search: '',
    },
    writable: true,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: originalLocation,
    writable: true,
  })
})

const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('RequireSession', () => {
  it('renders children when /me succeeds', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          user: {
            id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            email: 'a@x.com',
            name: 'A',
            pictureUrl: null,
          },
          tenant: {
            id: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
            slug: 'acme',
            name: 'Acme',
            isAdmin: false,
          },
          isSuperadmin: false,
          apps: ['studio'],
          csrfToken: 'tok',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    render(
      <RequireSession fallback={<div>loading</div>}>
        <div>inner</div>
      </RequireSession>,
      { wrapper },
    )

    await waitFor(() => {
      expect(screen.getByText('inner')).toBeTruthy()
    })
  })

  it('redirects to /console/login?returnTo=current when /me 401', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }))

    render(
      <RequireSession fallback={<div>loading</div>}>
        <div>inner</div>
      </RequireSession>,
      { wrapper },
    )

    await waitFor(() => {
      expect(window.location.href).toMatch(/\/console\/login\?returnTo=/)
      expect(decodeURIComponent(window.location.href)).toContain('/studio/runs')
    })
  })

  it('shows fallback while loading', () => {
    // Don't resolve fetchMock immediately — leave the query pending.
    fetchMock.mockImplementation(() => new Promise(() => {}))
    render(
      <RequireSession fallback={<div>loading</div>}>
        <div>inner</div>
      </RequireSession>,
      { wrapper },
    )
    expect(screen.getByText('loading')).toBeTruthy()
  })
})
