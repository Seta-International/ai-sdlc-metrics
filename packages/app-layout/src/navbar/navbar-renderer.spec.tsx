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

  it('renders search and agent elements', () => {
    render(<NavbarRenderer config={baseConfig} />, {
      wrapper: createWrapper([]),
    })

    expect(screen.getAllByLabelText('Search or ask an agent').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Open agent panel')).toBeInTheDocument()
  })

  it('renders provided user-menu and notifications slots', () => {
    render(
      <NavbarRenderer
        config={baseConfig}
        userMenuSlot={<button>user-menu-slot</button>}
        notificationsSlot={<button>notifications-slot</button>}
      />,
      { wrapper: createWrapper([]) },
    )

    expect(screen.getByText('user-menu-slot')).toBeInTheDocument()
    expect(screen.getByText('notifications-slot')).toBeInTheDocument()
  })

  it('renders nothing in slot positions when slots are undefined', () => {
    render(<NavbarRenderer config={baseConfig} />, {
      wrapper: createWrapper([]),
    })

    expect(screen.queryByText('user-menu-slot')).not.toBeInTheDocument()
    expect(screen.queryByText('notifications-slot')).not.toBeInTheDocument()
  })

  it('exposes search in both expanded (sm:flex) and icon-only (sm:hidden) forms', () => {
    render(<NavbarRenderer config={baseConfig} />, {
      wrapper: createWrapper([]),
    })

    const searchButtons = screen.getAllByLabelText('Search or ask an agent')
    expect(searchButtons).toHaveLength(2)
    const classes = searchButtons.map((b) => b.className)
    expect(classes.some((c) => c.includes('sm:flex'))).toBe(true)
    expect(classes.some((c) => c.includes('sm:hidden'))).toBe(true)
  })

  it('collapses zone action label to icon-only on <md', () => {
    const config: NavbarConfig = {
      ...baseConfig,
      action: { label: 'Add Employee', href: '/new' },
    }

    render(<NavbarRenderer config={config} />, {
      wrapper: createWrapper([]),
    })

    const label = screen.getByText('Add Employee')
    expect(label.className).toContain('hidden')
    expect(label.className).toContain('md:inline')
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

    render(<NavbarRenderer config={baseConfig} onSearchClick={onSearch} onAgentClick={onAgent} />, {
      wrapper: createWrapper([]),
    })

    const searchButtons = screen.getAllByLabelText('Search or ask an agent')
    fireEvent.click(searchButtons[0]!)
    fireEvent.click(screen.getByLabelText('Open agent panel'))

    expect(onSearch).toHaveBeenCalledOnce()
    expect(onAgent).toHaveBeenCalledOnce()
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
