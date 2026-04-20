import { describe, it, expect } from 'vitest'
import { plannerNavConfig } from './navigation'

describe('plannerNavConfig', () => {
  it('has the three Personal Hubs items in the first group', () => {
    const first = plannerNavConfig.sidebar[0]
    if (!first) throw new Error('expected a first group')
    if ('render' in first && first.render) throw new Error('expected first group to be static')
    if (!('items' in first) || !first.items) throw new Error('expected static items')
    expect(first.items.map((i) => i.label)).toEqual(['My Day', 'My Tasks', 'My Plans'])
    for (const item of first.items) {
      expect(item.permission).toBe('planner:personal:read')
    }
  })

  it('has a dynamic Plans group backed by a render function', () => {
    const second = plannerNavConfig.sidebar[1]
    if (!second) throw new Error('expected a second group')
    expect('render' in second).toBe(true)
    if ('render' in second) {
      expect(second.label).toBe('Plans')
      expect(typeof second.render).toBe('function')
    }
  })

  it('does not contain the removed Tasks/Reminders/KPI stubs', () => {
    const labels = plannerNavConfig.sidebar.flatMap((g) =>
      'items' in g && g.items ? g.items.map((i) => i.label) : [],
    )
    expect(labels).not.toContain('Tasks')
    expect(labels).not.toContain('Reminders')
    expect(labels).not.toContain('KPI Linkage')
  })
})
