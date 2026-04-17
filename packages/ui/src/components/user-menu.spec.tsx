import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UserMenu, type UserMenuUser } from './user-menu'

const baseUser: UserMenuUser = {
  displayName: 'Ada Lovelace',
  email: 'ada@example.com',
  tenantName: 'Acme Inc',
  tenantId: 'tenant-1',
  roles: ['people:profile:read'],
  initials: 'AL',
}

async function openMenu() {
  const user = userEvent.setup()
  const trigger = screen.getByRole('button', { name: /User menu for Ada Lovelace/ })
  await user.click(trigger)
  return user
}

describe('UserMenu', () => {
  it('renders avatar trigger with initials when no avatarUrl', () => {
    render(<UserMenu user={baseUser} profileHref="/people/me" />)
    const trigger = screen.getByRole('button', { name: 'User menu for Ada Lovelace' })
    expect(trigger).toHaveTextContent('AL')
  })

  it('renders avatar image when avatarUrl is provided', () => {
    render(
      <UserMenu
        user={{ ...baseUser, avatarUrl: 'https://example.com/a.png' }}
        profileHref="/people/me"
      />,
    )
    const trigger = screen.getByRole('button', { name: 'User menu for Ada Lovelace' })
    const img = trigger.querySelector('img')
    expect(img).not.toBeNull()
    expect(img).toHaveAttribute('src', 'https://example.com/a.png')
  })

  it('shows displayName, email, tenantName in the header', async () => {
    render(<UserMenu user={baseUser} profileHref="/people/me" />)
    await openMenu()
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
    expect(screen.getByText('Acme Inc')).toBeInTheDocument()
  })

  it('renders first role as chip and no +N when single role', async () => {
    render(<UserMenu user={baseUser} profileHref="/people/me" />)
    await openMenu()
    expect(screen.getByText('people:profile:read')).toBeInTheDocument()
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument()
  })

  it('renders +N badge when roles length > 1', async () => {
    render(<UserMenu user={{ ...baseUser, roles: ['a', 'b', 'c'] }} profileHref="/people/me" />)
    await openMenu()
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('renders My profile as a plain <a> with profileHref', async () => {
    render(<UserMenu user={baseUser} profileHref="/people/me" />)
    await openMenu()
    const anchor = screen.getByRole('menuitem', { name: /My profile/ })
    expect(anchor.tagName).toBe('A')
    expect(anchor.getAttribute('href')).toBe('/people/me')
  })

  it('omits Settings when settingsHref is not provided', async () => {
    render(<UserMenu user={baseUser} profileHref="/people/me" />)
    await openMenu()
    expect(screen.queryByRole('menuitem', { name: /Settings/ })).not.toBeInTheDocument()
  })

  it('renders Settings anchor when settingsHref is provided', async () => {
    render(<UserMenu user={baseUser} profileHref="/people/me" settingsHref="/people/settings/me" />)
    await openMenu()
    const anchor = screen.getByRole('menuitem', { name: /Settings/ })
    expect(anchor.tagName).toBe('A')
    expect(anchor.getAttribute('href')).toBe('/people/settings/me')
  })

  it('hides Switch tenant when tenants is undefined', async () => {
    render(<UserMenu user={baseUser} profileHref="/people/me" />)
    await openMenu()
    expect(screen.queryByText(/Switch tenant/)).not.toBeInTheDocument()
  })

  it('hides Switch tenant when tenants has only one entry', async () => {
    render(
      <UserMenu
        user={baseUser}
        profileHref="/people/me"
        tenants={[{ id: 'tenant-1', name: 'Acme Inc' }]}
      />,
    )
    await openMenu()
    expect(screen.queryByText(/Switch tenant/)).not.toBeInTheDocument()
  })

  it('shows Switch tenant submenu with each tenant when tenants.length > 1', async () => {
    const user = userEvent.setup()
    render(
      <UserMenu
        user={baseUser}
        profileHref="/people/me"
        tenants={[
          { id: 'tenant-1', name: 'Acme Inc' },
          { id: 'tenant-2', name: 'Beta Corp' },
        ]}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'User menu for Ada Lovelace' })
    await user.click(trigger)
    const subTrigger = screen.getByRole('menuitem', { name: /Switch tenant/ })
    await user.hover(subTrigger)
    expect(await screen.findByRole('menuitem', { name: /Beta Corp/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Acme Inc/ })).toBeInTheDocument()
  })

  it('marks the current tenant with a current indicator', async () => {
    const user = userEvent.setup()
    render(
      <UserMenu
        user={baseUser}
        profileHref="/people/me"
        tenants={[
          { id: 'tenant-1', name: 'Acme Inc' },
          { id: 'tenant-2', name: 'Beta Corp' },
        ]}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'User menu for Ada Lovelace' })
    await user.click(trigger)
    await user.hover(screen.getByRole('menuitem', { name: /Switch tenant/ }))
    const currentItem = await screen.findByRole('menuitem', { name: /Acme Inc/ })
    expect(within(currentItem).getByTestId('user-menu-tenant-current')).toBeInTheDocument()
    const otherItem = screen.getByRole('menuitem', { name: /Beta Corp/ })
    expect(within(otherItem).queryByTestId('user-menu-tenant-current')).not.toBeInTheDocument()
  })

  it('fires onSwitchTenant with tenant id when a tenant entry is activated', async () => {
    const user = userEvent.setup()
    const onSwitchTenant = vi.fn()
    render(
      <UserMenu
        user={baseUser}
        profileHref="/people/me"
        tenants={[
          { id: 'tenant-1', name: 'Acme Inc' },
          { id: 'tenant-2', name: 'Beta Corp' },
        ]}
        onSwitchTenant={onSwitchTenant}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'User menu for Ada Lovelace' })
    await user.click(trigger)
    const subTrigger = screen.getByRole('menuitem', { name: /Switch tenant/ })
    subTrigger.focus()
    await user.keyboard('{ArrowRight}')
    const other = await screen.findByRole('menuitem', { name: /Beta Corp/ })
    other.focus()
    await user.keyboard('{Enter}')
    expect(onSwitchTenant).toHaveBeenCalledWith('tenant-2')
  })

  it('hides Platform admin when isPlatformAdmin is false or undefined', async () => {
    render(<UserMenu user={baseUser} profileHref="/people/me" />)
    await openMenu()
    expect(screen.queryByRole('menuitem', { name: /Platform admin/ })).not.toBeInTheDocument()
  })

  it('renders Platform admin link with default /admin href when isPlatformAdmin', async () => {
    render(<UserMenu user={baseUser} profileHref="/people/me" isPlatformAdmin />)
    await openMenu()
    const anchor = screen.getByRole('menuitem', { name: /Platform admin/ })
    expect(anchor.tagName).toBe('A')
    expect(anchor.getAttribute('href')).toBe('/admin')
  })

  it('respects custom platformAdminHref', async () => {
    render(
      <UserMenu
        user={baseUser}
        profileHref="/people/me"
        isPlatformAdmin
        platformAdminHref="/ops"
      />,
    )
    await openMenu()
    const anchor = screen.getByRole('menuitem', { name: /Platform admin/ })
    expect(anchor.getAttribute('href')).toBe('/ops')
  })

  it('fires onLogout when Logout is clicked and handler is provided', async () => {
    const onLogout = vi.fn()
    const user = userEvent.setup()
    render(<UserMenu user={baseUser} profileHref="/people/me" onLogout={onLogout} />)
    await user.click(screen.getByRole('button', { name: 'User menu for Ada Lovelace' }))
    await user.click(screen.getByRole('menuitem', { name: /Logout/ }))
    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  describe('default logout', () => {
    const originalLocation = window.location

    beforeEach(() => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: { href: '' },
      })
    })

    afterEach(() => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: originalLocation,
      })
    })

    it('navigates to /auth/logout when no onLogout prop is provided', async () => {
      const user = userEvent.setup()
      render(<UserMenu user={baseUser} profileHref="/people/me" />)
      await user.click(screen.getByRole('button', { name: 'User menu for Ada Lovelace' }))
      await user.click(screen.getByRole('menuitem', { name: /Logout/ }))
      expect(window.location.href).toBe('/auth/logout')
    })

    it('navigates to logoutHref when provided (cross-zone shell URL)', async () => {
      const user = userEvent.setup()
      render(
        <UserMenu
          user={baseUser}
          profileHref="/people/me"
          logoutHref="http://localhost:3000/auth/logout"
        />,
      )
      await user.click(screen.getByRole('button', { name: 'User menu for Ada Lovelace' }))
      await user.click(screen.getByRole('menuitem', { name: /Logout/ }))
      expect(window.location.href).toBe('http://localhost:3000/auth/logout')
    })
  })
})
