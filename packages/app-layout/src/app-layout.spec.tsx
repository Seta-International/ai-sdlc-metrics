import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AppLayout } from './app-layout'
import type { NavigationConfig } from './types'
import { Users, Clock } from 'lucide-react'
import type { TRPCClient } from '@future/api-client'

vi.mock('next/navigation', () => ({
  usePathname: () => '/employees',
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}))

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock('@future/ui', () => {
  const D = ({ children }: any) => <div>{children}</div>
  return {
    cn: (...args: any[]) => args.filter(Boolean).join(' '),
    AppLauncher: () => null,
    AppLauncherTrigger: ({ onClick }: any) => <button onClick={onClick}>launcher</button>,
    SidebarTrigger: () => <button>sidebar</button>,
    FUTURE_APPS: [],
    LOCAL_FUTURE_APPS: [],
    SidebarProvider: D,
    SidebarInset: D,
    Sidebar: ({ children }: any) => <nav>{children}</nav>,
    SidebarContent: D,
    SidebarGroup: D,
    SidebarGroupLabel: ({ children }: any) => <span>{children}</span>,
    SidebarGroupContent: D,
    SidebarMenu: ({ children }: any) => <ul>{children}</ul>,
    SidebarMenuItem: ({ children }: any) => <li>{children}</li>,
    SidebarMenuButton: D,
    SidebarMenuSub: ({ children }: any) => <ul>{children}</ul>,
    SidebarMenuSubItem: ({ children }: any) => <li>{children}</li>,
    SidebarMenuSubButton: D,
    SidebarMenuBadge: ({ children }: any) => <span>{children}</span>,
  }
})
/* eslint-enable @typescript-eslint/no-explicit-any */

const testConfig: NavigationConfig = {
  navbar: {
    title: 'People',
    icon: Users,
  },
  sidebar: [
    {
      label: 'Directory',
      items: [
        { label: 'Employees', icon: Users, href: '/employees', permission: 'people:profile:read' },
        { label: 'Time Off', icon: Clock, href: '/time-off', permission: 'time:leave:read' },
      ],
    },
  ],
}

function createMockTrpc(permissions: string[]): TRPCClient {
  return {
    kernel: {
      getMyPermissions: {
        query: vi.fn().mockResolvedValue(permissions),
      },
    },
  } as unknown as TRPCClient
}

describe('AppLayout', () => {
  it('renders navbar title and permitted sidebar items', async () => {
    render(
      <AppLayout config={testConfig} trpc={createMockTrpc(['people:profile:read'])}>
        <div data-testid="content">Main content</div>
      </AppLayout>,
    )

    await waitFor(() => {
      expect(screen.getByText('People')).toBeInTheDocument()
      expect(screen.getByText('Employees')).toBeInTheDocument()
      expect(screen.queryByText('Time Off')).not.toBeInTheDocument()
      expect(screen.getByTestId('content')).toBeInTheDocument()
    })
  })

  it('renders children in the main content area', async () => {
    render(
      <AppLayout config={testConfig} trpc={createMockTrpc([])}>
        <h1>Hello World</h1>
      </AppLayout>,
    )

    await waitFor(() => {
      expect(screen.getByText('Hello World')).toBeInTheDocument()
    })
  })
})
