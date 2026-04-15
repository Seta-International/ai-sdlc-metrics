import { describe, it, expect } from 'vitest'
import type { NavGroup, NavItem } from '@future/app-layout'
import { peopleNavConfig } from './navigation'

describe('peopleNavConfig', () => {
  it('should have no duplicate href values across sidebar items', () => {
    const hrefs: string[] = []
    for (const group of peopleNavConfig.sidebar as NavGroup[]) {
      for (const item of group.items as NavItem[]) {
        hrefs.push(item.href)
      }
    }
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
    const allItems = peopleNavConfig.sidebar.flatMap((g: NavGroup) => g.items)
    const directoryItem = allItems.find((item: NavItem) => item.label === 'Directory')
    expect(directoryItem).toBeDefined()
    expect(directoryItem?.href).toBe('/')
  })
})
