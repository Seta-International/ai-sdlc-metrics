import { DollarSign, Receipt, Wallet, PiggyBank } from '@future/ui/icons'
import type { NavigationConfig } from '@future/app-layout'

export const financeNavConfig: NavigationConfig = {
  navbar: { title: 'Finance', icon: DollarSign },
  sidebar: [
    {
      items: [
        { label: 'Invoices', icon: Receipt, href: '/invoices', permission: 'finance:invoice:read' },
        { label: 'Payroll', icon: Wallet, href: '/payroll', permission: 'finance:payroll:read' },
        { label: 'Budget', icon: PiggyBank, href: '/budget', permission: 'finance:budget:read' },
      ],
    },
  ],
}
