import { describe, it, expect } from 'vitest'
import type { NavGroup, NavItem } from '@future/app-layout'
import { peopleNavConfig } from './navigation'

function staticItems(group: NavGroup): NavItem[] {
  return group.render ? [] : group.items
}

describe('peopleNavConfig', () => {
  it('should have no duplicate href values across sidebar items', () => {
    const hrefs = peopleNavConfig.sidebar.flatMap(staticItems).map((item) => item.href)
    const uniqueHrefs = new Set(hrefs)
    expect(uniqueHrefs.size).toBe(hrefs.length)
  })

  it('should have a navbar with title People', () => {
    expect(peopleNavConfig.navbar.title).toBe('People')
  })

  it('should have a navbar action pointing to /new', () => {
    expect(peopleNavConfig.navbar.action?.href).toBe('/new')
  })

  it('should include a Directory item with href /', () => {
    const allItems = peopleNavConfig.sidebar.flatMap(staticItems)
    const directoryItem = allItems.find((item) => item.label === 'Directory')
    expect(directoryItem).toBeDefined()
    expect(directoryItem?.href).toBe('/')
  })

  it('should not include a My Profile item', () => {
    const allItems = peopleNavConfig.sidebar.flatMap(staticItems)
    const labels = allItems.map((item) => item.label)
    expect(labels).not.toContain('My Profile')
  })
})
