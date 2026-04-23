'use client'

import * as React from 'react'
import { Check, MoreHorizontal } from 'lucide-react'
import { cn } from '../lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

export interface UserMenuUser {
  displayName: string
  email: string
  tenantName: string
  tenantId: string
  roles: readonly string[]
  avatarUrl?: string
  initials: string
}

export interface TenantOption {
  id: string
  name: string
}

export interface UserMenuProps {
  user: UserMenuUser
  tenants?: TenantOption[]
  isPlatformAdmin?: boolean
  profileHref: string
  settingsHref?: string
  platformAdminHref?: string
  /**
   * Absolute URL to the shell's logout endpoint. The auth/logout route lives
   * on web-shell only — relative URLs would 404 in any other zone.
   */
  logoutHref?: string
  onSwitchTenant?: (tenantId: string) => void
  onLogout?: () => void
}

export function UserMenu({
  user,
  tenants,
  isPlatformAdmin = false,
  profileHref,
  settingsHref,
  platformAdminHref = '/admin',
  logoutHref = '/auth/logout',
  onSwitchTenant,
  onLogout,
}: UserMenuProps) {
  const hasTenantSwitcher = !!tenants && tenants.length > 1
  const extraRoles = user.roles.length - 1
  const firstRole = user.roles[0]

  const handleLogout = () => {
    if (onLogout) {
      onLogout()
      return
    }
    window.location.href = logoutHref
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`User menu for ${user.displayName}`}
          className={cn(
            'flex w-full items-center gap-2 rounded-md p-1.5',
            'text-left transition-colors',
            'hover:bg-sidebar-accent/40',
            'focus:outline-none focus:ring-2 focus:ring-sidebar-ring/50',
          )}
        >
          <span
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full',
              'border border-border bg-elevated text-micro font-510 text-fg-primary',
            )}
          >
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              user.initials
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-caption-lg font-510 text-sidebar-foreground leading-tight">
              {user.displayName}
            </div>
            <div className="truncate text-tiny text-sidebar-foreground/40 leading-tight">
              {user.email}
            </div>
          </div>
          <MoreHorizontal className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/40" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={6}
        className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-52"
      >
        {/* Identity header */}
        <div className="flex items-center gap-2.5 px-2.5 py-2">
          <span
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full',
              'border border-border bg-elevated text-label font-510 text-fg-primary',
            )}
          >
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              user.initials
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-caption-lg font-510 text-foreground">
              {user.displayName}
            </div>
            <div className="truncate text-caption text-muted-foreground">{user.email}</div>
          </div>
        </div>

        {firstRole ? (
          <div className="flex items-center gap-1.5 px-2.5 pb-2">
            <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-label font-510 text-muted-foreground">
              {firstRole}
            </span>
            {extraRoles > 0 ? (
              <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-label font-510 text-muted-foreground">
                +{extraRoles}
              </span>
            ) : null}
          </div>
        ) : null}

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <a href={profileHref}>My profile</a>
        </DropdownMenuItem>

        {settingsHref ? (
          <DropdownMenuItem asChild>
            <a href={settingsHref}>Account settings</a>
          </DropdownMenuItem>
        ) : null}

        {hasTenantSwitcher ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Switch tenant</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {tenants!.map((tenant) => {
                const isCurrent = tenant.id === user.tenantId
                return (
                  <DropdownMenuItem key={tenant.id} onSelect={() => onSwitchTenant?.(tenant.id)}>
                    <span className="flex-1 truncate">{tenant.name}</span>
                    {isCurrent ? (
                      <Check
                        data-testid="user-menu-tenant-current"
                        className="ml-2 size-4 text-accent"
                        aria-label="Current tenant"
                      />
                    ) : null}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}

        {isPlatformAdmin ? (
          <DropdownMenuItem asChild className="text-accent">
            <a href={platformAdminHref}>Platform admin →</a>
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={handleLogout}
          className="text-destructive focus:text-destructive"
        >
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
