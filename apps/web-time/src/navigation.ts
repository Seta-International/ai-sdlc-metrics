import { Clock, CalendarDays, Timer, FileSpreadsheet } from 'lucide-react'
import type { NavigationConfig } from '@future/app-layout'

export const timeNavConfig: NavigationConfig = {
  navbar: { title: 'Time', icon: Clock },
  sidebar: [
    {
      items: [
        {
          label: 'Attendance',
          icon: Clock,
          href: '/attendance',
          permission: 'time:attendance:read',
        },
        { label: 'Leave', icon: CalendarDays, href: '/leave', permission: 'time:leave:read' },
        { label: 'Overtime', icon: Timer, href: '/overtime', permission: 'time:overtime:read' },
        {
          label: 'Timesheets',
          icon: FileSpreadsheet,
          href: '/timesheets',
          permission: 'time:timesheet:read',
        },
      ],
    },
  ],
}
