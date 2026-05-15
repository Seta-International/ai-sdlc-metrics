import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  to: string
  badge?: number | string
}

export interface AgentContext {
  page: string
  tenantId?: string
  selectionId?: string
}

export interface Tenant {
  id: string
  name: string
  role: 'admin' | 'member' | 'viewer'
}

export type Variant = 'success' | 'warning' | 'error' | 'info' | 'neutral'
