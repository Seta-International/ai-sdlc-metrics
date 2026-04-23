import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SidebarRenderer } from './sidebar-renderer'
import { PermissionContext } from '../permission-provider'
import type { NavGroup } from '../types'
import type { ReactNode } from 'react'
import { Users, Clock, UserMinus } from 'lucide-react'
import { SidebarProvider } from '@future/ui'

vi.mock('next/navigation', () => ({
  usePathname: () => '/employees',
}))

function createWrapper(permissions: string[], defaultOpen = true) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <PermissionContext.Provider
        value={{ permissions: new Set(permissions), roles: [], isLoading: false }}
      >
        <SidebarProvider defaultOpen={defaultOpen}>{children}</SidebarProvider>
      </PermissionContext.Provider>
    )
  }
}

const testGroups: NavGroup[] = [
  {
    label: 'Directory',
    items: [
      { label: 'Employees', icon: Users, href: '/employees', permission: 'people:profile:read' },
      { label: 'Attendance', icon: Clock, href: '/attendance', permission: 'time:attendance:read' },
    ],
  },
  {
    label: 'Admin',
    items: [
      {
        label: 'Offboarding',
        icon: UserMinus,
        href: '/offboarding',
        permission: 'people:offboard:manage',
      },
    ],
  },
]

describe('SidebarRenderer', () => {
  it('renders items the user has permission for', () => {
    render(<SidebarRenderer groups={testGroups} />, {
      wrapper: createWrapper(['people:profile:read', 'time:attendance:read']),
    })

    expect(screen.getByText('Employees')).toBeInTheDocument()
    expect(screen.getByText('Attendance')).toBeInTheDocument()
  })

  it('hides items the user lacks permission for', () => {
    render(<SidebarRenderer groups={testGroups} />, {
      wrapper: createWrapper(['people:profile:read']),
    })

    expect(screen.getByText('Employees')).toBeInTheDocument()
    expect(screen.queryByText('Attendance')).not.toBeInTheDocument()
  })

  it('hides entire group when all items are filtered out', () => {
    render(<SidebarRenderer groups={testGroups} />, {
      wrapper: createWrapper(['people:profile:read']),
    })

    expect(screen.getByText('Directory')).toBeInTheDocument()
    expect(screen.queryByText('Admin')).not.toBeInTheDocument()
  })

  it('renders items without permission key as always visible', () => {
    const groups: NavGroup[] = [
      {
        items: [{ label: 'Dashboard', icon: Users, href: '/dashboard' }],
      },
    ]

    render(<SidebarRenderer groups={groups} />, {
      wrapper: createWrapper([]),
    })

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('renders Sidebar in icon-collapsible mode', () => {
    const { container } = render(<SidebarRenderer groups={testGroups} />, {
      wrapper: createWrapper(['people:profile:read', 'time:attendance:read'], false),
    })

    const sidebarRoot = container.querySelector('[data-slot="sidebar"]')
    expect(sidebarRoot).not.toBeNull()
    expect(sidebarRoot?.getAttribute('data-collapsible')).toBe('icon')
  })

  it('renders dynamic group content via NavGroup.render', () => {
    const DynamicContent = () => <div data-testid="dynamic-content">Hub body</div>
    const dynamicGroups: NavGroup[] = [{ label: 'Dynamic', render: () => <DynamicContent /> }]
    render(<SidebarRenderer groups={dynamicGroups} />, {
      wrapper: createWrapper([]),
    })
    expect(screen.getByTestId('dynamic-content')).toBeInTheDocument()
    expect(screen.getByText('Dynamic')).toBeInTheDocument()
  })

  it('wires a tooltip on every top-level menu button', () => {
    const { container } = render(<SidebarRenderer groups={testGroups} />, {
      wrapper: createWrapper(['people:profile:read', 'time:attendance:read']),
    })

    const menuButtons = container.querySelectorAll('[data-slot="sidebar-menu-button"]')
    expect(menuButtons.length).toBeGreaterThan(0)
    for (const button of menuButtons) {
      expect(button.getAttribute('data-state')).toBe('closed')
    }
  })

  it('renders zone title inside the app-switcher button', () => {
    render(<SidebarRenderer groups={testGroups} zoneTitle="People" zoneIcon={Users} />, {
      wrapper: createWrapper(['people:profile:read']),
    })
    expect(screen.getByText('People')).toBeInTheDocument()
  })

  it('renders app-switcher button with "Switch app" aria-label', () => {
    render(<SidebarRenderer groups={testGroups} zoneTitle="People" zoneIcon={Users} />, {
      wrapper: createWrapper(['people:profile:read']),
    })
    expect(screen.getByRole('button', { name: 'Switch app' })).toBeInTheDocument()
  })

  it('calls onAppLauncherClick when the app-switcher button is clicked', () => {
    const onAppLauncher = vi.fn()
    render(
      <SidebarRenderer
        groups={testGroups}
        zoneTitle="People"
        zoneIcon={Users}
        onAppLauncherClick={onAppLauncher}
      />,
      { wrapper: createWrapper(['people:profile:read']) },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Switch app' }))
    expect(onAppLauncher).toHaveBeenCalledOnce()
  })

  it('renders inline search button in sidebar header', () => {
    render(<SidebarRenderer groups={testGroups} onSearchClick={vi.fn()} />, {
      wrapper: createWrapper(['people:profile:read']),
    })
    // The expanded search bar has aria-label "Search…"
    expect(screen.getAllByRole('button', { name: 'Search…' }).length).toBeGreaterThan(0)
  })

  it('calls onSearchClick when the sidebar search button is clicked', () => {
    const onSearch = vi.fn()
    render(<SidebarRenderer groups={testGroups} onSearchClick={onSearch} />, {
      wrapper: createWrapper(['people:profile:read']),
    })
    // Click the expanded search button (first match in expanded mode)
    fireEvent.click(screen.getAllByRole('button', { name: 'Search…' })[0]!)
    expect(onSearch).toHaveBeenCalledOnce()
  })

  it('renders user menu slot in sidebar footer when provided', () => {
    render(<SidebarRenderer groups={testGroups} userMenuSlot={<button>user-footer</button>} />, {
      wrapper: createWrapper([]),
    })
    expect(screen.getByText('user-footer')).toBeInTheDocument()
  })

  it('renders a sidebar collapse/expand trigger in the header', () => {
    const { container } = render(
      <SidebarRenderer groups={testGroups} zoneTitle="People" zoneIcon={Users} />,
      { wrapper: createWrapper(['people:profile:read']) },
    )
    const triggers = container.querySelectorAll('[data-slot="sidebar-trigger"]')
    expect(triggers.length).toBeGreaterThan(0)
  })
})
