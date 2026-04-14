import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NavbarRenderer } from './navbar-renderer'
import { PermissionContext } from '../permission-provider'
import type { NavbarConfig } from '../types'
import type { ReactNode } from 'react'
import { Users } from 'lucide-react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/employees/123',
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
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
})
