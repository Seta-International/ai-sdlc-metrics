import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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

  it('wires a tooltip on every top-level menu button', () => {
    const { container } = render(<SidebarRenderer groups={testGroups} />, {
      wrapper: createWrapper(['people:profile:read', 'time:attendance:read']),
    })

    const menuButtons = container.querySelectorAll('[data-slot="sidebar-menu-button"]')
    expect(menuButtons.length).toBeGreaterThan(0)
    for (const button of menuButtons) {
      // Radix Tooltip's TooltipTrigger (with asChild) emits data-state on the wrapped element.
      // Its presence proves the SidebarMenuButton received a tooltip prop.
      expect(button.getAttribute('data-state')).toBe('closed')
    }
  })
})
