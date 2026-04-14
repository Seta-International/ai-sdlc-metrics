import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export interface NavItem {
  label: string
  icon: LucideIcon
  href: string
  /** Permission key (e.g. 'people:profile:read'). Omit = always visible. */
  permission?: string
  /** Nested submenu items */
  children?: NavItem[]
  /** Dynamic badge (count, status dot) */
  badge?: () => ReactNode
}

export interface NavGroup {
  /** Optional section header label */
  label?: string
  items: NavItem[]
}

export interface NavbarConfig {
  /** Zone display name, e.g. "People" */
  title: string
  /** Zone icon */
  icon: LucideIcon
  /** Optional primary action button in the navbar */
  action?: {
    label: string
    href: string
    permission?: string
  }
}

export interface NavigationConfig {
  navbar: NavbarConfig
  sidebar: NavGroup[]
}
