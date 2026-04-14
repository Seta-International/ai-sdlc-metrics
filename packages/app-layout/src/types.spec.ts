import { describe, it, expectTypeOf } from 'vitest'
import type { NavigationConfig, NavItem, NavGroup, NavbarConfig } from './types'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

describe('NavigationConfig types', () => {
  it('NavItem has required label, icon, href', () => {
    expectTypeOf<NavItem>().toHaveProperty('label')
    expectTypeOf<NavItem>().toHaveProperty('icon')
    expectTypeOf<NavItem>().toHaveProperty('href')
  })

  it('NavItem.permission is optional string', () => {
    expectTypeOf<NavItem['permission']>().toEqualTypeOf<string | undefined>()
  })

  it('NavItem.children is optional NavItem array', () => {
    expectTypeOf<NavItem['children']>().toEqualTypeOf<NavItem[] | undefined>()
  })

  it('NavItem.badge is optional function returning ReactNode', () => {
    expectTypeOf<NavItem['badge']>().toEqualTypeOf<(() => ReactNode) | undefined>()
  })

  it('NavGroup.label is optional', () => {
    expectTypeOf<NavGroup['label']>().toEqualTypeOf<string | undefined>()
  })

  it('NavbarConfig has title and icon', () => {
    expectTypeOf<NavbarConfig>().toHaveProperty('title')
    expectTypeOf<NavbarConfig['icon']>().toEqualTypeOf<LucideIcon>()
  })

  it('NavbarConfig.action is optional with label, href, permission', () => {
    type Action = NonNullable<NavbarConfig['action']>
    expectTypeOf<Action>().toHaveProperty('label')
    expectTypeOf<Action>().toHaveProperty('href')
    expectTypeOf<Action['permission']>().toEqualTypeOf<string | undefined>()
  })

  it('NavigationConfig combines navbar and sidebar', () => {
    expectTypeOf<NavigationConfig>().toHaveProperty('navbar')
    expectTypeOf<NavigationConfig>().toHaveProperty('sidebar')
    expectTypeOf<NavigationConfig['sidebar']>().toEqualTypeOf<NavGroup[]>()
  })
})
