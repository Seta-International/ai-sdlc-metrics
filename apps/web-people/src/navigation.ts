// apps/web-people/src/navigation.ts
import {
  Users,
  Network,
  UserPlus,
  UserMinus,
  FileCheck,
  BarChart3,
  Settings,
} from '@future/ui/icons'
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
      ],
    },
    {
      label: 'Workflows',
      items: [
        {
          label: 'Onboarding',
          icon: UserPlus,
          href: '/onboarding',
          permission: 'people:profile:read',
        },
        {
          label: 'Offboarding',
          icon: UserMinus,
          href: '/offboarding',
          permission: 'people:profile:read',
        },
        {
          label: 'Change Requests',
          icon: FileCheck,
          href: '/change-requests',
          permission: 'people:profile:read',
        },
      ],
    },
    {
      label: 'Insights',
      items: [
        {
          label: 'Reports',
          icon: BarChart3,
          href: '/reports',
          permission: 'people:profile:read',
        },
        {
          label: 'Settings',
          icon: Settings,
          href: '/settings',
          permission: 'people:settings:read',
        },
      ],
    },
  ],
}
