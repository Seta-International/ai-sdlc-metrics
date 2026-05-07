import {
  Settings,
  Cpu,
  ToggleRight,
  Shield,
  Bot,
  Link,
  Building2,
  ShieldCheck,
} from '@future/ui/icons'
import type { NavigationConfig } from '@future/app-layout'

export const adminNavConfig: NavigationConfig = {
  navbar: { title: 'Admin', icon: Settings },
  sidebar: [
    {
      label: 'Platform',
      items: [
        {
          label: 'Organizations',
          icon: Building2,
          href: '/system/platform-admins',
          permission: 'admin:platform:read',
        },
      ],
    },
    {
      items: [
        {
          label: 'Tenant Settings',
          icon: Settings,
          href: '/settings',
          permission: 'admin:tenant:read',
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
        { label: 'Agent Definitions', icon: Bot, href: '/agents', permission: 'admin:agent:read' },
        { label: 'Sessions', icon: Bot, href: '/agents/sessions', permission: 'admin:agent:read' },
        {
          label: 'Knowledge Base',
          icon: Bot,
          href: '/agents/knowledge-base',
          permission: 'admin:agent:read',
        },
        {
          label: 'GA Readiness',
          icon: ShieldCheck,
          href: '/agents/readiness',
          permission: 'agent:readiness:read',
        },
      ],
    },
    {
      label: 'Integrations',
      items: [
        {
          label: 'Microsoft 365',
          icon: Link,
          href: '/integrations/microsoft',
          permission: 'planner.ms_sync.connect',
        },
      ],
    },
  ],
}
