import { describe, it, expect } from 'vitest'
import { mapMsPlanToDomain } from './ms-plan.mapper'

describe('mapMsPlanToDomain', () => {
  it('maps title, etag, and container info', () => {
    const ms = {
      id: 'p1',
      title: 'Marketing Q2',
      container: {
        type: 'group',
        containerId: 'g-123',
      },
      '@odata.etag': 'W/"xyz"',
    }
    const result = mapMsPlanToDomain(ms, { tenantId: 't1' })
    expect(result.msPlanId).toBe('p1')
    expect(result.msPlanEtag).toBe('W/"xyz"')
    expect(result.title).toBe('Marketing Q2')
    expect(result.containerType).toBe('ms_group')
    expect(result.containerRef).toBe('g-123')
  })

  it('maps roster container', () => {
    const ms = {
      id: 'p2',
      title: 'Roster Plan',
      container: { type: 'roster', containerId: 'r-1' },
      '@odata.etag': 'W/"abc"',
    }
    const result = mapMsPlanToDomain(ms, { tenantId: 't1' })
    expect(result.containerType).toBe('ms_roster')
    expect(result.containerRef).toBe('r-1')
  })

  it('throws on missing id', () => {
    expect(() => mapMsPlanToDomain({ title: 'x' } as any, { tenantId: 't1' })).toThrow(/id/)
  })

  it('includes tenantId in result', () => {
    const ms = {
      id: 'p3',
      title: 'T',
      container: { type: 'group', containerId: 'g-1' },
      '@odata.etag': 'W/"e"',
    }
    const result = mapMsPlanToDomain(ms, { tenantId: 'tenant-abc' })
    expect(result.tenantId).toBe('tenant-abc')
  })

  it('throws on missing containerId', () => {
    expect(() =>
      mapMsPlanToDomain({ id: 'p4', container: { type: 'group' } } as any, { tenantId: 't1' }),
    ).toThrow(/containerId/)
  })

  it('throws on unsupported container type', () => {
    expect(() =>
      mapMsPlanToDomain({ id: 'p5', container: { type: 'team', containerId: 'x' } } as any, {
        tenantId: 't1',
      }),
    ).toThrow(/Unsupported container type/)
  })

  it('defaults etag to empty string when missing', () => {
    const ms = {
      id: 'p6',
      title: 'No etag',
      container: { type: 'group', containerId: 'g-2' },
    }
    const result = mapMsPlanToDomain(ms, { tenantId: 't1' })
    expect(result.msPlanEtag).toBe('')
  })

  it('defaults title to (untitled) when missing', () => {
    const ms = {
      id: 'p7',
      container: { type: 'roster', containerId: 'r-2' },
      '@odata.etag': 'W/"z"',
    }
    const result = mapMsPlanToDomain(ms, { tenantId: 't1' })
    expect(result.title).toBe('(untitled)')
  })
})
