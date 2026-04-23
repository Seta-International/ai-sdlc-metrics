import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionUserMenu } from './session-user-menu'

interface MeResponse {
  actorId: string
  tenantId: string
  tenantName: string
  roles: string[]
  displayName: string
  email: string
  provider?: string
}

function baseClaims(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    actorId: 'actor-1',
    tenantId: 'tenant-1',
    tenantName: 'Acme Inc',
    roles: ['people:profile:read'],
    displayName: 'Jane Doe',
    email: 'jane@example.com',
    provider: 'entra',
    ...overrides,
  }
}

function mockFetchOk(body: unknown) {
  const res = {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response
  return vi.fn().mockResolvedValue(res)
}

function mockFetchStatus(status: number) {
  const res = {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
  } as unknown as Response
  return vi.fn().mockResolvedValue(res)
}

async function openMenu(displayName: string) {
  const user = userEvent.setup()
  const trigger = await screen.findByRole('button', {
    name: new RegExp(`User menu for ${displayName}`),
  })
  await user.click(trigger)
  return user
}

describe('SessionUserMenu', () => {
  const originalFetch = globalThis.fetch
  const originalLocation = window.location

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { href: '' },
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    })
    vi.restoreAllMocks()
  })

  it('calls /api/auth/me with credentials on mount', async () => {
    const fetchMock = mockFetchOk(baseClaims())
    globalThis.fetch = fetchMock as unknown as typeof fetch
    render(<SessionUserMenu />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', { credentials: 'include' })
  })

  it('renders derived initials, displayName, email, tenantName on 200', async () => {
    globalThis.fetch = mockFetchOk(baseClaims()) as unknown as typeof fetch
    render(<SessionUserMenu />)
    const trigger = await screen.findByRole('button', { name: /User menu for Jane Doe/ })
    expect(trigger).toHaveTextContent('JD')
    await openMenu('Jane Doe')
    const header = screen.getByTestId('user-menu-header')
    expect(within(header).getByText('Jane Doe')).toBeInTheDocument()
    expect(within(header).getByText('jane@example.com')).toBeInTheDocument()
    expect(within(header).getByText('Acme Inc')).toBeInTheDocument()
  })

  it('renders "?" initials when displayName is empty', async () => {
    globalThis.fetch = mockFetchOk(baseClaims({ displayName: '' })) as unknown as typeof fetch
    render(<SessionUserMenu />)
    const trigger = await screen.findByRole('button', { name: /User menu for/ })
    expect(trigger).toHaveTextContent('?')
  })

  it('uses first two chars uppercased when displayName is a single word', async () => {
    globalThis.fetch = mockFetchOk(baseClaims({ displayName: 'cher' })) as unknown as typeof fetch
    render(<SessionUserMenu />)
    const trigger = await screen.findByRole('button', { name: /User menu for cher/ })
    expect(trigger).toHaveTextContent('CH')
  })

  it('shows Platform admin link when roles include platform_admin', async () => {
    globalThis.fetch = mockFetchOk(
      baseClaims({ roles: ['platform_admin', 'people:read'] }),
    ) as unknown as typeof fetch
    render(<SessionUserMenu />)
    await openMenu('Jane Doe')
    const anchor = screen.getByRole('menuitem', { name: /Platform admin/ })
    expect(anchor.tagName).toBe('A')
    expect(anchor.getAttribute('href')).toBe('https://admin.future.seta-international.vn')
  })

  it('does not show Platform admin when roles lack platform_admin', async () => {
    globalThis.fetch = mockFetchOk(baseClaims()) as unknown as typeof fetch
    render(<SessionUserMenu />)
    await openMenu('Jane Doe')
    expect(screen.queryByRole('menuitem', { name: /Platform admin/ })).not.toBeInTheDocument()
  })

  it('defaults profileHref to production people zone and platformAdminHref to admin zone', async () => {
    globalThis.fetch = mockFetchOk(
      baseClaims({ roles: ['platform_admin'] }),
    ) as unknown as typeof fetch
    render(<SessionUserMenu />)
    await openMenu('Jane Doe')
    const profileAnchor = screen.getByRole('menuitem', { name: /My profile/ })
    expect(profileAnchor.getAttribute('href')).toBe(
      'https://people.future.seta-international.vn/me',
    )
    const adminAnchor = screen.getByRole('menuitem', { name: /Platform admin/ })
    expect(adminAnchor.getAttribute('href')).toBe('https://admin.future.seta-international.vn')
  })

  it('uses localhost zone URLs when NEXT_PUBLIC_LOCAL_DEV is true', async () => {
    vi.stubEnv('NEXT_PUBLIC_LOCAL_DEV', 'true')
    try {
      globalThis.fetch = mockFetchOk(
        baseClaims({ roles: ['platform_admin'] }),
      ) as unknown as typeof fetch
      render(<SessionUserMenu />)
      await openMenu('Jane Doe')
      const profileAnchor = screen.getByRole('menuitem', { name: /My profile/ })
      expect(profileAnchor.getAttribute('href')).toBe('http://localhost:3001/me')
      const adminAnchor = screen.getByRole('menuitem', { name: /Platform admin/ })
      expect(adminAnchor.getAttribute('href')).toBe('http://localhost:3010')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('respects profileHref, settingsHref, platformAdminHref overrides', async () => {
    globalThis.fetch = mockFetchOk(
      baseClaims({ roles: ['platform_admin'] }),
    ) as unknown as typeof fetch
    render(
      <SessionUserMenu
        profileHref="/custom/profile"
        settingsHref="/custom/settings"
        platformAdminHref="/ops"
      />,
    )
    await openMenu('Jane Doe')
    expect(screen.getByRole('menuitem', { name: /My profile/ }).getAttribute('href')).toBe(
      '/custom/profile',
    )
    expect(screen.getByRole('menuitem', { name: /Settings/ }).getAttribute('href')).toBe(
      '/custom/settings',
    )
    expect(screen.getByRole('menuitem', { name: /Platform admin/ }).getAttribute('href')).toBe(
      '/ops',
    )
  })

  it('redirects to /auth/login on 401', async () => {
    globalThis.fetch = mockFetchStatus(401) as unknown as typeof fetch
    const { container } = render(<SessionUserMenu />)
    await waitFor(() => {
      expect(window.location.href).toBe('/auth/login')
    })
    expect(container.firstChild).toBeNull()
  })

  it('renders fallback with "?" initials on 500', async () => {
    globalThis.fetch = mockFetchStatus(500) as unknown as typeof fetch
    render(<SessionUserMenu />)
    const trigger = await screen.findByRole('button', { name: /User menu for/ })
    expect(trigger).toHaveTextContent('?')
  })

  it('renders fallback with "?" initials when fetch throws', async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error('network down')) as unknown as typeof fetch
    render(<SessionUserMenu />)
    const trigger = await screen.findByRole('button', { name: /User menu for/ })
    expect(trigger).toHaveTextContent('?')
  })
})
