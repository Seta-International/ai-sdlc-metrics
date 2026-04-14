import { Users, Network, UserMinus, Building2 } from 'lucide-react'
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
      label: 'Directory',
      items: [
        {
          label: 'Employees',
          icon: Users,
          href: '/employees',
          permission: 'people:profile:read',
        },
        {
          label: 'Org Chart',
          icon: Network,
          href: '/org-chart',
          permission: 'people:org:read',
        },
        {
          label: 'Departments',
          icon: Building2,
          href: '/departments',
          permission: 'people:department:read',
        },
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
  ],
}
