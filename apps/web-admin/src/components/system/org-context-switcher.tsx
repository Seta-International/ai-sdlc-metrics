'use client'

import Link from 'next/link'
import { Button } from '@future/ui'
import { ArrowLeft, Building2 } from '@future/ui/icons'

interface OrgContextSwitcherProps {
  activeOrgName: string | null
  activeOrgSlug: string | null
}

/**
 * Shown in the org layout when a platform_admin is viewing a specific tenant's
 * admin pages. Provides a banner indicating the active org context and a
 * back-to-platform link.
 *
 * Returns null when activeOrgName is not set (tenant_admin view — no impersonation).
 */
export function OrgContextSwitcher({ activeOrgName, activeOrgSlug }: OrgContextSwitcherProps) {
  if (!activeOrgName || !activeOrgSlug) {
    return null
  }

  return (
    <div
      className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
      data-testid="org-context-switcher"
    >
      <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="flex-1 font-medium">{activeOrgName}</span>
      <span className="text-xs text-muted-foreground">/{activeOrgSlug}</span>
      <Button variant="ghost" size="sm" asChild>
        <Link href="/system/platform-admins">
          <ArrowLeft className="mr-1 size-3" aria-hidden="true" />
          Back to Platform
        </Link>
      </Button>
    </div>
  )
}
