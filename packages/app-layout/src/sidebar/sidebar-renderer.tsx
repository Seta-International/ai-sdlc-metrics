'use client'

import { usePathname } from 'next/navigation'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarMenuBadge,
} from '@future/ui'
import { useContext } from 'react'
import { PermissionContext } from '../permission-provider'
import type { NavGroup, NavItem } from '../types'

function useFilteredItems(items: NavItem[]): NavItem[] {
  const { permissions, isLoading } = useContext(PermissionContext)
  if (isLoading) return []
  return items.filter((item) => !item.permission || permissions.has(item.permission))
}

function SidebarNavItem({ item }: { item: NavItem }) {
  const pathname = usePathname()
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
  const visibleChildren = useFilteredItems(item.children ?? [])

  if (visibleChildren.length > 0) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton isActive={isActive} tooltip={item.label} asChild>
          <a href={item.href}>
            <item.icon />
            <span>{item.label}</span>
          </a>
        </SidebarMenuButton>
        {item.badge && <SidebarMenuBadge>{item.badge()}</SidebarMenuBadge>}
        <SidebarMenuSub>
          {visibleChildren.map((child) => (
            <SidebarSubNavItem key={child.href} item={child} />
          ))}
        </SidebarMenuSub>
      </SidebarMenuItem>
    )
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={isActive} tooltip={item.label} asChild>
        <a href={item.href}>
          <item.icon />
          <span>{item.label}</span>
        </a>
      </SidebarMenuButton>
      {item.badge && <SidebarMenuBadge>{item.badge()}</SidebarMenuBadge>}
    </SidebarMenuItem>
  )
}

function SidebarSubNavItem({ item }: { item: NavItem }) {
  const pathname = usePathname()
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton isActive={isActive} asChild>
        <a href={item.href}>
          <span>{item.label}</span>
        </a>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  )
}

export interface SidebarRendererProps {
  groups: NavGroup[]
}

export function SidebarRenderer({ groups }: SidebarRendererProps) {
  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {groups.map((group, index) => (
          <SidebarNavGroup key={group.label ?? index} group={group} />
        ))}
      </SidebarContent>
    </Sidebar>
  )
}

function SidebarNavGroup({ group }: { group: NavGroup }) {
  const visibleItems = useFilteredItems(group.items)

  if (visibleItems.length === 0) return null

  return (
    <SidebarGroup>
      {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {visibleItems.map((item) => (
            <SidebarNavItem key={item.href} item={item} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
