import { FUTURE_APPS, LOCAL_FUTURE_APPS, type AppDefinition } from '@future/ui'

function zoneBase(id: string): string {
  const list: readonly AppDefinition[] =
    process.env['NEXT_PUBLIC_LOCAL_DEV'] === 'true' ? LOCAL_FUTURE_APPS : FUTURE_APPS
  const found = list.find((a) => a.id === id)
  if (!found) throw new Error(`Unknown zone id: ${id}`)
  return found.href.replace(/\/$/, '')
}

/**
 * Shell base URL — owns SSO + logout. Auth routes (`/auth/*`) only live on
 * web-shell, so links from any other zone must use an absolute URL.
 */
function shellBase(): string {
  const fromEnv = process.env['NEXT_PUBLIC_SHELL_URL']
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return process.env['NEXT_PUBLIC_LOCAL_DEV'] === 'true'
    ? 'http://localhost:3000'
    : 'https://future.seta-international.vn'
}

export function getZoneRoutes(): {
  profile: string
  accountSettings: string
  platformAdmin: string
  logout: string
} {
  return {
    profile: `${zoneBase('people')}/me`,
    accountSettings: `${zoneBase('people')}/settings/me`,
    platformAdmin: zoneBase('admin'),
    logout: `${shellBase()}/auth/logout`,
  }
}
