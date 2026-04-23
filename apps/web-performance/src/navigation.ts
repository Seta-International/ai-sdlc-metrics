import { BarChart3, Star, MessageSquare } from '@future/ui/icons'
import type { NavigationConfig } from '@future/app-layout'

export const performanceNavConfig: NavigationConfig = {
  navbar: { title: 'Performance', icon: BarChart3 },
  sidebar: [
    {
      items: [
        {
          label: 'Review Cycles',
          icon: BarChart3,
          href: '/cycles',
          permission: 'performance:cycle:read',
        },
        {
          label: 'Evaluations',
          icon: Star,
          href: '/evaluations',
          permission: 'performance:eval:read',
        },
        {
          label: 'Feedback',
          icon: MessageSquare,
          href: '/feedback',
          permission: 'performance:feedback:read',
        },
      ],
    },
  ],
}
