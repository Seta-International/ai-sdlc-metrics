import type { NavItem } from '@seta/ui'
import { Building2, Home, PlugZap, ShieldCheck, User, Users } from 'lucide-react'

export function consoleNav(isAdmin: boolean): NavItem[] {
  return [
    { id: 'home', label: 'Home', icon: Home, to: '/' },
    { id: 'profile', label: 'Profile', icon: User, to: '/profile' },
    ...(isAdmin
      ? ([
          { id: 'members', label: 'Members', icon: Users, to: '/members' },
          { id: 'connectors', label: 'Connectors', icon: PlugZap, to: '/connectors' },
        ] satisfies NavItem[])
      : []),
  ]
}

export function superadminNav(): NavItem[] {
  return [
    { id: 'tenants', label: 'Tenants', icon: Building2, to: '/admin/tenants' },
    { id: 'system', label: 'System', icon: ShieldCheck, to: '/admin' },
  ]
}
