import { Settings, Cpu, ToggleRight, Shield, Bot } from '@future/ui/icons'
import type { NavigationConfig } from '@future/app-layout'

export const adminNavConfig: NavigationConfig = {
  navbar: { title: 'Admin', icon: Settings },
  sidebar: [
    {
      items: [
        {
          label: 'Tenant Settings',
          icon: Settings,
          href: '/settings',
          permission: 'admin:settings:read',
        },
        { label: 'AI Config', icon: Cpu, href: '/ai-config', permission: 'admin:ai:read' },
        {
          label: 'Module Toggles',
          icon: ToggleRight,
          href: '/modules',
          permission: 'admin:module:read',
        },
        {
          label: 'Roles & Permissions',
          icon: Shield,
          href: '/roles',
          permission: 'admin:role:read',
        },
      ],
    },
    {
      label: 'Agents',
      items: [
        { label: 'Agent Definitions', icon: Bot, href: '/agents', permission: 'admin:agents:read' },
        { label: 'Sessions', icon: Bot, href: '/agents/sessions', permission: 'admin:agents:read' },
      ],
    },
  ],
}
