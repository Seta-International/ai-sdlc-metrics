import { Bot, MessageCircle, Wrench } from 'lucide-react'
import type { NavigationConfig } from '@future/app-layout'

export const agentsNavConfig: NavigationConfig = {
  navbar: { title: 'Agents', icon: Bot },
  sidebar: [
    {
      items: [
        { label: 'Agent Configs', icon: Bot, href: '/configs', permission: 'agents:config:read' },
        {
          label: 'Sessions',
          icon: MessageCircle,
          href: '/sessions',
          permission: 'agents:session:read',
        },
        { label: 'Tools', icon: Wrench, href: '/tools', permission: 'agents:tool:read' },
      ],
    },
  ],
}
