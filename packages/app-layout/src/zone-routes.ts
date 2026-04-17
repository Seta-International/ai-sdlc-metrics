import { FUTURE_APPS, LOCAL_FUTURE_APPS, type AppDefinition } from '@future/ui'

function zoneBase(id: string): string {
  const list: readonly AppDefinition[] =
    process.env['NEXT_PUBLIC_LOCAL_DEV'] === 'true' ? LOCAL_FUTURE_APPS : FUTURE_APPS
  const found = list.find((a) => a.id === id)
  if (!found) throw new Error(`Unknown zone id: ${id}`)
  return found.href.replace(/\/$/, '')
}

export function getZoneRoutes(): {
  profile: string
  accountSettings: string
  platformAdmin: string
} {
  return {
    profile: `${zoneBase('people')}/me`,
    accountSettings: `${zoneBase('people')}/settings/me`,
    platformAdmin: zoneBase('admin'),
  }
}
