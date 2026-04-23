import { FolderKanban, Users, Truck } from '@future/ui/icons'
import type { NavigationConfig } from '@future/app-layout'

export const projectsNavConfig: NavigationConfig = {
  navbar: { title: 'Projects', icon: FolderKanban },
  sidebar: [
    {
      items: [
        { label: 'Staffing', icon: Users, href: '/staffing', permission: 'projects:staffing:read' },
        {
          label: 'Assignments',
          icon: FolderKanban,
          href: '/assignments',
          permission: 'projects:assignment:read',
        },
        { label: 'Delivery', icon: Truck, href: '/delivery', permission: 'projects:delivery:read' },
      ],
    },
  ],
}
