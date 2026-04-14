import { Target, TrendingUp, Flag } from 'lucide-react'
import type { NavigationConfig } from '@future/app-layout'

export const goalsNavConfig: NavigationConfig = {
  navbar: { title: 'Goals', icon: Target },
  sidebar: [
    {
      items: [
        { label: 'OKRs', icon: Target, href: '/okrs', permission: 'goals:okr:read' },
        { label: 'KPIs', icon: TrendingUp, href: '/kpis', permission: 'goals:kpi:read' },
        {
          label: 'Objectives',
          icon: Flag,
          href: '/objectives',
          permission: 'goals:objective:read',
        },
      ],
    },
  ],
}
