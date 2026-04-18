import { ListTodo, Bell, Link2, LayoutGrid } from 'lucide-react'
import type { NavigationConfig } from '@future/app-layout'

export const plannerNavConfig: NavigationConfig = {
  navbar: { title: 'Planner', icon: ListTodo },
  sidebar: [
    {
      items: [
        { label: 'Plans', icon: LayoutGrid, href: '/plans', permission: 'planner:plan:read-any' },
        { label: 'Tasks', icon: ListTodo, href: '/tasks', permission: 'planner:task:read' },
        { label: 'Reminders', icon: Bell, href: '/reminders', permission: 'planner:reminder:read' },
        { label: 'KPI Linkage', icon: Link2, href: '/kpi-linkage', permission: 'planner:kpi:read' },
      ],
    },
  ],
}
