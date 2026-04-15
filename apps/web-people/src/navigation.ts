// apps/web-people/src/navigation.ts
import {
  Users,
  Network,
  User,
  UserPlus,
  UserMinus,
  FileCheck,
  BarChart3,
  Settings,
} from 'lucide-react'
import type { NavigationConfig } from '@future/app-layout'

export const peopleNavConfig: NavigationConfig = {
  navbar: {
    title: 'People',
    icon: Users,
    action: {
      label: 'Add Employee',
      href: '/new',
      permission: 'people:profile:create',
    },
  },
  sidebar: [
    {
      label: 'People',
      items: [
        {
          label: 'Directory',
          icon: Users,
          href: '/',
          permission: 'people:profile:read',
        },
        {
          label: 'Org Chart',
          icon: Network,
          href: '/org-chart',
          permission: 'people:org:read',
        },
        {
          label: 'My Profile',
          icon: User,
          href: '/me',
        },
      ],
    },
    {
      label: 'Workflows',
      items: [
        {
          label: 'Onboarding',
          icon: UserPlus,
          href: '/onboarding',
          permission: 'people:onboard:manage',
        },
        {
          label: 'Offboarding',
          icon: UserMinus,
          href: '/offboarding',
          permission: 'people:offboard:manage',
        },
        {
          label: 'Change Requests',
          icon: FileCheck,
          href: '/change-requests',
          permission: 'people:changes:review',
        },
      ],
    },
    {
      label: 'Analytics',
      items: [
        {
          label: 'Reports',
          icon: BarChart3,
          href: '/reports',
          permission: 'people:reports:read',
        },
      ],
    },
    {
      label: 'Configuration',
      items: [
        {
          label: 'Settings',
          icon: Settings,
          href: '/settings',
          permission: 'people:settings:manage',
        },
      ],
    },
  ],
}
