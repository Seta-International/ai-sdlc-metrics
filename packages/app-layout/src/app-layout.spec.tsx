import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AppLayout } from './app-layout'
import type { NavigationConfig } from './types'
import { Users, Clock } from 'lucide-react'
import type { PermissionTrpcClient } from './permission-provider'
import { useOptionalAgentState } from '@future/agent'

vi.mock('next/navigation', () => ({
  usePathname: () => '/employees',
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}))

vi.mock('@future/agent', () => ({
  useOptionalAgentState: vi.fn(() => ({ panelOpen: false, togglePanel: vi.fn() })),
  AgentPanel: () => <div data-testid="agent-panel" />,
  AgentStrip: () => <div data-testid="agent-strip" />,
}))

vi.mock('./session-user-menu', () => ({
  SessionUserMenu: () => <div data-testid="session-user-menu" />,
}))

vi.mock('./stub-notifications-popover', () => ({
  StubNotificationsPopover: () => <div data-testid="stub-notifications-popover" />,
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

function createMockTrpc(permissions: string[]): PermissionTrpcClient {
  return {
    kernel: {
      getMyPermissions: {
        query: vi.fn().mockResolvedValue(permissions),
      },
    },
  } as unknown as PermissionTrpcClient
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

  it('renders AgentStrip in the layout', () => {
    render(
      <AppLayout config={testConfig} trpc={createMockTrpc([])}>
        <div>content</div>
      </AppLayout>,
    )

    expect(screen.getByTestId('agent-strip')).toBeDefined()
  })

  it('renders AgentPanel when panelOpen is true', () => {
    vi.mocked(useOptionalAgentState).mockReturnValueOnce({
      panelOpen: true,
      togglePanel: vi.fn(),
      setPanelOpen: vi.fn(),
      activeSessionId: null,
      setActiveSessionId: vi.fn(),
      insights: [],
      setInsights: vi.fn(),
      addInsight: vi.fn(),
      dismissInsight: vi.fn(),
    })

    render(
      <AppLayout config={testConfig} trpc={createMockTrpc([])}>
        <div>content</div>
      </AppLayout>,
    )

    expect(screen.getByTestId('agent-panel')).toBeDefined()
  })

  it('mounts SessionUserMenu and StubNotificationsPopover as navbar slots', async () => {
    render(
      <AppLayout config={testConfig} trpc={createMockTrpc([])}>
        <div>content</div>
      </AppLayout>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('session-user-menu')).toBeInTheDocument()
      expect(screen.getByTestId('stub-notifications-popover')).toBeInTheDocument()
    })
  })

  it('renders without agent state (null state from useOptionalAgentState)', () => {
    vi.mocked(useOptionalAgentState).mockReturnValueOnce(null)
    render(
      <AppLayout config={testConfig} trpc={createMockTrpc([])}>
        <div>content</div>
      </AppLayout>,
    )
    // AgentPanel is always in the DOM for slide animation; the container has width 0 when closed
    expect(screen.getByTestId('agent-panel')).toBeDefined()
    expect(screen.getByText('content')).toBeDefined()
  })
})
