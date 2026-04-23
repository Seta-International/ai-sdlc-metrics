import { LineChart, LayoutDashboard, FileBarChart } from '@future/ui/icons'
import type { NavigationConfig } from '@future/app-layout'

export const insightsNavConfig: NavigationConfig = {
  navbar: { title: 'Insights', icon: LineChart },
  sidebar: [
    {
      items: [
        {
          label: 'Dashboards',
          icon: LayoutDashboard,
          href: '/dashboards',
          permission: 'insights:dashboard:read',
        },
        {
          label: 'Reports',
          icon: FileBarChart,
          href: '/reports',
          permission: 'insights:report:read',
        },
      ],
    },
  ],
}
