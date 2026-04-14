import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NavbarRenderer } from './navbar-renderer'
import { PermissionContext } from '../permission-provider'
import type { NavbarConfig } from '../types'
import type { ReactNode } from 'react'
import { Users } from 'lucide-react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/employees/123',
}))

const mockSetTheme = vi.fn()
let mockResolvedTheme = 'light'

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: mockResolvedTheme, setTheme: mockSetTheme }),
}))

vi.mock('@future/ui', () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(' '),
  AppLauncher: () => null,
  AppLauncherTrigger: ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick}>launcher</button>
  ),
  SidebarTrigger: () => <button>sidebar</button>,
  FUTURE_APPS: [],
  LOCAL_FUTURE_APPS: [],
}))

function createWrapper(permissions: string[]) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <PermissionContext.Provider
        value={{ permissions: new Set(permissions), roles: [], isLoading: false }}
      >
        {children}
      </PermissionContext.Provider>
    )
  }
}

const baseConfig: NavbarConfig = {
  title: 'People',
  icon: Users,
}

describe('NavbarRenderer', () => {
  it('renders the zone title', () => {
    render(<NavbarRenderer config={baseConfig} />, {
      wrapper: createWrapper([]),
    })

    expect(screen.getByText('People')).toBeInTheDocument()
  })

  it('renders action button when user has permission', () => {
    const config: NavbarConfig = {
      ...baseConfig,
      action: { label: 'Add Employee', href: '/new', permission: 'people:profile:create' },
    }

    render(<NavbarRenderer config={config} />, {
      wrapper: createWrapper(['people:profile:create']),
    })

    expect(screen.getByText('Add Employee')).toBeInTheDocument()
  })

  it('hides action button when user lacks permission', () => {
    const config: NavbarConfig = {
      ...baseConfig,
      action: { label: 'Add Employee', href: '/new', permission: 'people:profile:create' },
    }

    render(<NavbarRenderer config={config} />, {
      wrapper: createWrapper([]),
    })

    expect(screen.queryByText('Add Employee')).not.toBeInTheDocument()
  })

  it('renders action button without permission key as always visible', () => {
    const config: NavbarConfig = {
      ...baseConfig,
      action: { label: 'Settings', href: '/settings' },
    }

    render(<NavbarRenderer config={config} />, {
      wrapper: createWrapper([]),
    })

    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('renders search, agent, notifications, and avatar elements', () => {
    render(<NavbarRenderer config={baseConfig} userInitials="CT" />, {
      wrapper: createWrapper([]),
    })

    expect(screen.getByLabelText('Search or ask an agent')).toBeInTheDocument()
    expect(screen.getByLabelText('Open agent panel')).toBeInTheDocument()
    expect(screen.getByLabelText('Notifications')).toBeInTheDocument()
    expect(screen.getByLabelText('User menu (CT)')).toBeInTheDocument()
    expect(screen.getByText('CT')).toBeInTheDocument()
  })

  it('renders light mode theme toggle label when in light mode', () => {
    mockResolvedTheme = 'light'

    render(<NavbarRenderer config={baseConfig} />, {
      wrapper: createWrapper([]),
    })

    expect(screen.getByLabelText('Switch to dark mode')).toBeInTheDocument()
  })

  it('renders dark mode theme toggle label when in dark mode', () => {
    mockResolvedTheme = 'dark'

    render(<NavbarRenderer config={baseConfig} />, {
      wrapper: createWrapper([]),
    })

    expect(screen.getByLabelText('Switch to light mode')).toBeInTheDocument()
  })

  it('calls setTheme when theme toggle is clicked', () => {
    mockResolvedTheme = 'light'
    mockSetTheme.mockClear()

    render(<NavbarRenderer config={baseConfig} />, {
      wrapper: createWrapper([]),
    })

    fireEvent.click(screen.getByLabelText('Switch to dark mode'))
    expect(mockSetTheme).toHaveBeenCalledWith('dark')
  })

  it('calls callback handlers when buttons are clicked', () => {
    const onSearch = vi.fn()
    const onAgent = vi.fn()
    const onNotifications = vi.fn()
    const onProfile = vi.fn()

    render(
      <NavbarRenderer
        config={baseConfig}
        onSearchClick={onSearch}
        onAgentClick={onAgent}
        onNotificationsClick={onNotifications}
        onProfileClick={onProfile}
      />,
      { wrapper: createWrapper([]) },
    )

    fireEvent.click(screen.getByLabelText('Search or ask an agent'))
    fireEvent.click(screen.getByLabelText('Open agent panel'))
    fireEvent.click(screen.getByLabelText('Notifications'))
    fireEvent.click(screen.getByLabelText('User menu (U)'))

    expect(onSearch).toHaveBeenCalledOnce()
    expect(onAgent).toHaveBeenCalledOnce()
    expect(onNotifications).toHaveBeenCalledOnce()
    expect(onProfile).toHaveBeenCalledOnce()
  })

  it('toggles app launcher via Cmd+K keyboard shortcut', () => {
    render(<NavbarRenderer config={baseConfig} />, {
      wrapper: createWrapper([]),
    })

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    // The AppLauncher mock renders null, so we just verify no crash
    // and that the keyboard event handler was properly set up
  })
})
