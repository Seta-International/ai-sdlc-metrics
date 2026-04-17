'use client'

import * as React from 'react'
import { Check } from 'lucide-react'
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
    window.location.href = '/auth/logout'
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`User menu for ${user.displayName}`}
          className={cn(
            'flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-full',
            'bg-primary text-micro font-510 text-primary-foreground',
            'transition-all hover:bg-primary/90',
            'focus:outline-none focus:ring-2 focus:ring-primary/50',
          )}
        >
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            user.initials
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <div className="flex flex-col gap-0.5 px-2 py-1.5">
          <span className="text-caption font-510 text-muted-foreground truncate">
            {user.tenantName}
          </span>
          <span className="text-sm font-510 text-foreground truncate">{user.displayName}</span>
          <span className="text-xs text-muted-foreground truncate">{user.email}</span>
        </div>

        {firstRole ? (
          <div className="flex items-center gap-1.5 px-2 pb-1.5">
            <span className="inline-flex items-center rounded-full border border-border px-2 text-label font-510 text-secondary-foreground">
              {firstRole}
            </span>
            {extraRoles > 0 ? (
              <span className="inline-flex items-center rounded-full border border-border px-2 text-label font-510 text-secondary-foreground">
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
            <a href={settingsHref}>Settings</a>
          </DropdownMenuItem>
        ) : null}

        {hasTenantSwitcher ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-accent">Switch tenant</DropdownMenuSubTrigger>
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
          className="hover:text-destructive focus:text-destructive"
        >
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
