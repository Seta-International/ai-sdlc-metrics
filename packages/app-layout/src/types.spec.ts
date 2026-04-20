import { describe, it, expectTypeOf } from 'vitest'
import type {
  NavigationConfig,
  NavItem,
  NavGroup,
  NavGroupStatic,
  NavGroupDynamic,
  NavbarConfig,
} from './types'
import type { LucideIcon } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'

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

  it('NavGroupStatic.label is optional', () => {
    expectTypeOf<NavGroupStatic['label']>().toEqualTypeOf<string | undefined>()
  })

  it('NavGroupStatic has items', () => {
    expectTypeOf<NavGroupStatic['items']>().toEqualTypeOf<NavItem[]>()
  })

  it('NavGroupDynamic has render returning ReactElement', () => {
    expectTypeOf<NavGroupDynamic['render']>().toEqualTypeOf<() => ReactElement>()
  })

  it('NavGroup union accepts static branch', () => {
    const staticGroup: NavGroup = { label: 'x', items: [] }
    expectTypeOf(staticGroup).toMatchTypeOf<NavGroup>()
  })

  it('NavGroup union accepts dynamic branch', () => {
    const DynamicNode: () => ReactElement = () => null as unknown as ReactElement
    const dynamicGroup: NavGroup = { label: 'y', render: DynamicNode }
    expectTypeOf(dynamicGroup).toMatchTypeOf<NavGroup>()
  })

  it('TypeScript rejects a NavGroup with BOTH items and render', () => {
    // @ts-expect-error — NavGroup is a strict union; cannot carry both discriminants
    const invalid: NavGroup = { items: [], render: () => null as unknown as ReactElement }
    // Reference to suppress unused-var lint
    void invalid
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
