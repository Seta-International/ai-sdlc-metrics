'use client'

import * as React from 'react'
import { UserMenu, type UserMenuUser } from '@future/ui/user-menu'
import { getZoneRoutes } from './zone-routes'

export interface SessionUserMenuProps {
  profileHref?: string
  settingsHref?: string
  platformAdminHref?: string
  logoutHref?: string
}

interface SessionClaims {
  actorId: string
  tenantId: string
  tenantName: string
  roles: readonly string[]
  displayName: string
  email: string
  provider?: string
}

type FetchState =
  | { kind: 'loading' }
  | { kind: 'ready'; user: UserMenuUser; isPlatformAdmin: boolean }
  | { kind: 'redirecting' }
  | { kind: 'error' }

function deriveInitials(displayName: string): string {
  const trimmed = displayName.trim()
  if (trimmed.length === 0) return '?'
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length >= 2) {
    return (words[0]!.charAt(0) + words[1]!.charAt(0)).toUpperCase()
  }
  const only = words[0]!
  return only.slice(0, 2).toUpperCase()
}

export function SessionUserMenu(props: SessionUserMenuProps): React.JSX.Element | null {
  const { profileHref, settingsHref, platformAdminHref, logoutHref } = props
  const [state, setState] = React.useState<FetchState>({ kind: 'loading' })

  React.useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' })
        if (cancelled) return

        if (res.status === 401) {
          setState({ kind: 'redirecting' })
          window.location.href = '/auth/login'
          return
        }

        if (!res.ok) {
          setState({ kind: 'error' })
          return
        }

        const claims = (await res.json()) as SessionClaims
        if (cancelled) return

        const displayName = claims.displayName ?? ''
        const user: UserMenuUser = {
          displayName,
          email: claims.email ?? '',
          tenantName: claims.tenantName ?? '',
          tenantId: claims.tenantId ?? '',
          roles: claims.roles ?? [],
          initials: deriveInitials(displayName),
        }
        const isPlatformAdmin = (claims.roles ?? []).includes('platform_admin')
        setState({ kind: 'ready', user, isPlatformAdmin })
      } catch {
        if (cancelled) return
        setState({ kind: 'error' })
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  const zoneRoutes = React.useMemo(() => getZoneRoutes(), [])
  const resolvedProfileHref = profileHref ?? zoneRoutes.profile
  const resolvedSettingsHref = settingsHref ?? zoneRoutes.accountSettings
  const resolvedPlatformAdminHref = platformAdminHref ?? zoneRoutes.platformAdmin
  const resolvedLogoutHref = logoutHref ?? zoneRoutes.logout

  if (state.kind === 'redirecting') {
    return null
  }

  if (state.kind === 'loading') {
    const placeholderUser: UserMenuUser = {
      displayName: '',
      email: '',
      tenantName: '',
      tenantId: '',
      roles: [],
      initials: '…',
    }
    return (
      <UserMenu
        user={placeholderUser}
        profileHref={resolvedProfileHref}
        platformAdminHref={resolvedPlatformAdminHref}
        logoutHref={resolvedLogoutHref}
      />
    )
  }

  if (state.kind === 'error') {
    const fallbackUser: UserMenuUser = {
      displayName: '',
      email: '',
      tenantName: '',
      tenantId: '',
      roles: [],
      initials: '?',
    }
    return (
      <UserMenu
        user={fallbackUser}
        profileHref={resolvedProfileHref}
        platformAdminHref={resolvedPlatformAdminHref}
        logoutHref={resolvedLogoutHref}
      />
    )
  }

  return (
    <UserMenu
      user={state.user}
      isPlatformAdmin={state.isPlatformAdmin}
      profileHref={resolvedProfileHref}
      settingsHref={resolvedSettingsHref}
      platformAdminHref={resolvedPlatformAdminHref}
      logoutHref={resolvedLogoutHref}
    />
  )
}
