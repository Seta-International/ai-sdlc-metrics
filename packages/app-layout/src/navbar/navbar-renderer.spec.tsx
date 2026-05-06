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

vi.mock('@future/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@future/ui')>()
  return {
    ...actual,
    cn: (...args: string[]) => args.filter(Boolean).join(' '),
  }
})

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
  it('renders the zone title in the breadcrumb', () => {
    render(<NavbarRenderer config={baseConfig} />, {
      wrapper: createWrapper([]),
    })

    expect(screen.getByText('People')).toBeInTheDocument()
  })

  it('renders Ask AI toggle button', () => {
    render(<NavbarRenderer config={baseConfig} />, {
      wrapper: createWrapper([]),
    })

    expect(screen.getByLabelText('Open AI panel')).toBeInTheDocument()
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

  it('calls onAgentClick when Ask AI button is clicked', () => {
    const onAgent = vi.fn()

    render(<NavbarRenderer config={baseConfig} onAgentClick={onAgent} />, {
      wrapper: createWrapper([]),
    })

    fireEvent.click(screen.getByLabelText('Open AI panel'))
    expect(onAgent).toHaveBeenCalledOnce()
  })

  it('shows active state on Ask AI button when panel is open', () => {
    render(<NavbarRenderer config={baseConfig} agentPanelOpen />, {
      wrapper: createWrapper([]),
    })

    expect(screen.getByLabelText('Close AI panel')).toBeInTheDocument()
  })

  it('calls onSearchClick via Cmd+K keyboard shortcut', () => {
    const onSearch = vi.fn()
    render(<NavbarRenderer config={baseConfig} onSearchClick={onSearch} />, {
      wrapper: createWrapper([]),
    })

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(onSearch).toHaveBeenCalledOnce()
  })

  it('calls onAgentClick via Cmd+J keyboard shortcut', () => {
    const onAgent = vi.fn()
    render(<NavbarRenderer config={baseConfig} onAgentClick={onAgent} />, {
      wrapper: createWrapper([]),
    })

    fireEvent.keyDown(window, { key: 'j', metaKey: true })
    expect(onAgent).toHaveBeenCalledOnce()
  })
})
