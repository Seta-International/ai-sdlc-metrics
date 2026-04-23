import { UserSearch, Briefcase, FileText, Users } from '@future/ui/icons'
import type { NavigationConfig } from '@future/app-layout'

export const hiringNavConfig: NavigationConfig = {
  navbar: {
    title: 'Hiring',
    icon: UserSearch,
    action: { label: 'New Position', href: '/positions/new', permission: 'hiring:position:create' },
  },
  sidebar: [
    {
      label: 'Pipeline',
      items: [
        {
          label: 'Candidates',
          icon: Users,
          href: '/candidates',
          permission: 'hiring:candidate:read',
        },
        {
          label: 'Positions',
          icon: Briefcase,
          href: '/positions',
          permission: 'hiring:position:read',
        },
        { label: 'Offers', icon: FileText, href: '/offers', permission: 'hiring:offer:read' },
      ],
    },
  ],
}
