import { Sun, ListChecks, Folder, ListTodo, FileText } from '@future/ui/icons'
import type { NavigationConfig } from '@future/app-layout'
import { PlannerSidebarPlansGroup } from './components/sidebar/PlannerSidebarPlansGroup'

export const plannerNavConfig: NavigationConfig = {
  navbar: { title: 'Planner', icon: ListTodo },
  sidebar: [
    {
      items: [
        {
          label: 'My Day',
          icon: Sun,
          href: '/personal/today/board',
          permission: 'planner:personal:read',
        },
        {
          label: 'My Tasks',
          icon: ListChecks,
          href: '/personal/tasks/board',
          permission: 'planner:personal:read',
        },
        {
          label: 'My Plans',
          icon: Folder,
          href: '/personal/plans',
          permission: 'planner:personal:read',
        },
        {
          label: 'Transcripts',
          icon: FileText,
          href: '/personal/transcripts',
          permission: 'planner:personal:read',
        },
      ],
    },
    {
      label: 'Plans',
      render: () => <PlannerSidebarPlansGroup />,
    },
  ],
}
