import { describe, expect, it } from 'vitest'
import { adminNavConfig } from './navigation'

/**
 * Admin permission keys that must exist in apps/api/src/common/auth/permissions.ts.
 * This is a local copy — the canonical source of truth is the PERMISSIONS registry.
 * Update both when adding new permissions.
 */
const ADMIN_PERMISSION_KEYS = new Set([
  'admin:role:read',
  'admin:role:manage',
  'admin:tenant:read',
  'admin:tenant:manage',
  'admin:tenant:timezone:update',
  'admin:audit:read',
  'admin:idp:read',
  'admin:idp:configure',
  'admin:idp:sync',
  'admin:user:read',
  'admin:user:manage',
  'admin:agent:read',
  'admin:agent:manage',
  'admin:platform:read',
  'admin:platform:manage',
  'admin:tenant:switch',
  'admin:ai:read',
  'admin:ai:manage',
  'admin:module:read',
  'admin:module:manage',
  // Planner integration permissions used in sidebar
  'planner.ms_sync.connect',
])

type NavItem = {
  label: string
  href: string
  permission?: string
  icon?: unknown
}

type NavGroup = {
  label?: string
  items?: NavItem[]
  render?: unknown
}

function collectPermissions(groups: NavGroup[]): Array<{ label: string; permission: string }> {
  const result: Array<{ label: string; permission: string }> = []
  for (const group of groups) {
    if (group.items) {
      for (const item of group.items) {
        if (item.permission) {
          result.push({ label: item.label, permission: item.permission })
        }
      }
    }
  }
  return result
}

describe('adminNavConfig', () => {
  it('every nav item permission is registered in the admin permission keys', () => {
    const items = collectPermissions(adminNavConfig.sidebar as NavGroup[])
    expect(items.length).toBeGreaterThan(0)

    const offenders = items.filter((i) => !ADMIN_PERMISSION_KEYS.has(i.permission))
    expect(
      offenders,
      `Nav items with unregistered permissions:\n` +
        offenders.map((o) => `  - "${o.label}": ${o.permission}`).join('\n'),
    ).toEqual([])
  })

  it('uses admin:agent:read (singular) not admin:agents:read', () => {
    const items = collectPermissions(adminNavConfig.sidebar as NavGroup[])
    const wrongAgents = items.filter((i) => i.permission === 'admin:agents:read')
    expect(wrongAgents).toEqual([])
  })

  it('Tenant Settings uses admin:tenant:read', () => {
    const items = collectPermissions(adminNavConfig.sidebar as NavGroup[])
    const tenantSettings = items.find((i) => i.label === 'Tenant Settings')
    expect(tenantSettings?.permission).toBe('admin:tenant:read')
  })

  it('AI Config uses admin:ai:read', () => {
    const items = collectPermissions(adminNavConfig.sidebar as NavGroup[])
    const aiConfig = items.find((i) => i.label === 'AI Config')
    expect(aiConfig?.permission).toBe('admin:ai:read')
  })

  it('Module Toggles uses admin:module:read', () => {
    const items = collectPermissions(adminNavConfig.sidebar as NavGroup[])
    const moduleToggles = items.find((i) => i.label === 'Module Toggles')
    expect(moduleToggles?.permission).toBe('admin:module:read')
  })

  it('Roles & Permissions uses admin:role:read', () => {
    const items = collectPermissions(adminNavConfig.sidebar as NavGroup[])
    const roles = items.find((i) => i.label === 'Roles & Permissions')
    expect(roles?.permission).toBe('admin:role:read')
  })

  it('Organizations uses admin:platform:read and links to /system/platform-admins', () => {
    const items = collectPermissions(adminNavConfig.sidebar as NavGroup[])
    const orgs = items.find((i) => i.label === 'Organizations')
    expect(orgs?.permission).toBe('admin:platform:read')
  })

  it('Organizations href points to /system/platform-admins', () => {
    const allItems: NavItem[] = []
    for (const group of adminNavConfig.sidebar as NavGroup[]) {
      if (group.items) {
        allItems.push(...group.items)
      }
    }
    const orgs = allItems.find((i) => i.label === 'Organizations')
    expect(orgs?.href).toBe('/system/platform-admins')
  })
})
