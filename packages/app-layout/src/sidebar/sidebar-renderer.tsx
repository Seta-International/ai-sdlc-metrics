'use client'

import { usePathname } from 'next/navigation'
import { ChevronDown, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useContext } from 'react'
import {
  cn,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarTrigger,
} from '@future/ui'
import { PermissionContext } from '../permission-provider'
import type { NavGroup, NavGroupStatic, NavItem } from '../types'

function useFilteredItems(items: NavItem[]): NavItem[] {
  const { permissions, isLoading } = useContext(PermissionContext)
  if (isLoading) return []
  return items.filter((item) => !item.permission || permissions.has(item.permission))
}

function SidebarNavItem({ item }: { item: NavItem }) {
  const pathname = usePathname()
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
  const visibleChildren = useFilteredItems(item.children ?? [])

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        size="sm"
        tooltip={item.label}
        asChild
        className="font-510 tracking-[-0.01em]"
      >
        <a href={item.href}>
          <item.icon />
          <span>{item.label}</span>
        </a>
      </SidebarMenuButton>
      {item.badge && (
        <SidebarMenuBadge className="text-label font-510">{item.badge()}</SidebarMenuBadge>
      )}
      {visibleChildren.length > 0 && (
        <SidebarMenuSub>
          {visibleChildren.map((child) => (
            <SidebarSubNavItem key={child.href} item={child} />
          ))}
        </SidebarMenuSub>
      )}
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
  userMenuSlot?: ReactNode
  zoneTitle?: string
  zoneIcon?: LucideIcon
  onSearchClick?: () => void
  onAppLauncherClick?: () => void
}

export function SidebarRenderer({
  groups,
  userMenuSlot,
  zoneTitle,
  zoneIcon: ZoneIcon,
  onSearchClick,
  onAppLauncherClick,
}: SidebarRendererProps) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-0 p-0 border-b border-sidebar-border">
        {/* Icon-mode: expand trigger + search icon */}
        <div className="hidden group-data-[collapsible=icon]:flex flex-col items-center gap-1.5 py-2.5">
          <SidebarTrigger className="h-7 w-7 text-sidebar-foreground/50 hover:text-sidebar-foreground" />
          {onSearchClick && (
            <button
              type="button"
              onClick={onSearchClick}
              aria-label="Search…"
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-md',
                'text-sidebar-foreground/40 hover:text-sidebar-foreground',
                'transition-colors hover:bg-sidebar-accent/40',
                'focus:outline-none focus:ring-2 focus:ring-sidebar-ring/50',
              )}
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Expanded mode: zone branding row + search — hidden when icon-collapsed */}
        <div className="group-data-[collapsible=icon]:hidden">
          <div className="flex items-center gap-1 px-2 py-2.5">
            {/* Zone branding / app-switcher button */}
            {(zoneTitle || ZoneIcon) && (
              <button
                type="button"
                onClick={onAppLauncherClick}
                aria-label="Switch app"
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-0.5',
                  'hover:bg-sidebar-accent/40 transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-sidebar-ring/50',
                )}
              >
                {ZoneIcon && (
                  <div className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded bg-primary/10">
                    <ZoneIcon className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div className="min-w-0 flex-1 text-left">
                  {zoneTitle && (
                    <div className="truncate text-caption-lg font-510 text-sidebar-foreground">
                      {zoneTitle}
                    </div>
                  )}
                </div>
                <ChevronDown className="h-3 w-3 shrink-0 text-sidebar-foreground/30" />
              </button>
            )}
            {/* Collapse trigger — right-aligned */}
            <SidebarTrigger
              className={cn(
                'shrink-0 h-5.5 w-5.5',
                'text-sidebar-foreground/40 hover:text-sidebar-foreground',
                'hover:bg-sidebar-accent/40',
              )}
            />
          </div>

          {/* Inline search */}
          <div className="px-2 pb-2">
            <button
              type="button"
              onClick={onSearchClick}
              aria-label="Search…"
              className={cn(
                'flex h-7 w-full items-center gap-2 rounded-md px-2',
                'border border-sidebar-border bg-transparent',
                'text-caption text-sidebar-foreground/40',
                'transition-colors hover:bg-sidebar-accent/40 hover:text-sidebar-foreground/60',
                'focus:outline-none focus:ring-2 focus:ring-sidebar-ring/50',
              )}
            >
              <Search className="h-3 w-3 shrink-0" />
              <span className="flex-1 text-left text-caption">Search…</span>
              <span className="font-mono text-tiny opacity-40">⌘K</span>
            </button>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group, index) => (
          <SidebarNavGroup key={group.label ?? index} group={group} />
        ))}
      </SidebarContent>

      {userMenuSlot && (
        <SidebarFooter className="border-t border-sidebar-border p-2">{userMenuSlot}</SidebarFooter>
      )}
    </Sidebar>
  )
}

function SidebarNavGroup({ group }: { group: NavGroup }) {
  if (group.render) {
    return (
      <SidebarGroup>
        {group.label && (
          <SidebarGroupLabel className="h-auto py-1.5 px-2 text-tiny font-510 uppercase tracking-[0.04em] text-sidebar-foreground/40">
            {group.label}
          </SidebarGroupLabel>
        )}
        <SidebarGroupContent>{group.render()}</SidebarGroupContent>
      </SidebarGroup>
    )
  }

  return <StaticSidebarNavGroup group={group} />
}

function StaticSidebarNavGroup({ group }: { group: NavGroupStatic }) {
  const visibleItems = useFilteredItems(group.items)

  if (visibleItems.length === 0) return null

  return (
    <SidebarGroup>
      {group.label && (
        <SidebarGroupLabel className="h-auto py-1.5 px-2 text-tiny font-510 uppercase tracking-[0.04em] text-sidebar-foreground/40">
          {group.label}
        </SidebarGroupLabel>
      )}
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
