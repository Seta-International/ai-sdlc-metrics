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

function createWrapper(permissions: string[]) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <PermissionContext.Provider
        value={{ permissions: new Set(permissions), roles: [], isLoading: false }}
      >
        <SidebarProvider defaultOpen={true}>{children}</SidebarProvider>
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
})
