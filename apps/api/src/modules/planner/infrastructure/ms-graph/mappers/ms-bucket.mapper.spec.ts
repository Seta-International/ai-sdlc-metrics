import { describe, it, expect } from 'vitest'
import { mapMsBucketToDomain } from './ms-bucket.mapper'

describe('mapMsBucketToDomain', () => {
  it('maps id, name, planId, orderHint and etag', () => {
    const ms = {
      id: 'b1',
      name: 'Backlog',
      planId: 'ms-plan-1',
      orderHint: ' 8585',
      '@odata.etag': 'W/"bucket-etag"',
    }
    const result = mapMsBucketToDomain(ms, { tenantId: 't1', localPlanId: 'local-plan-uuid' })
    expect(result.msBucketId).toBe('b1')
    expect(result.msBucketEtag).toBe('W/"bucket-etag"')
    expect(result.name).toBe('Backlog')
    expect(result.msPlanId).toBe('ms-plan-1')
    expect(result.localPlanId).toBe('local-plan-uuid')
    expect(result.orderHint).toBe(' 8585')
    expect(result.tenantId).toBe('t1')
  })

  it('throws on missing id', () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mapMsBucketToDomain({ name: 'No id', planId: 'p1' } as any, {
        tenantId: 't1',
        localPlanId: 'lp1',
      }),
    ).toThrow(/id/)
  })

  it('defaults etag to empty string when missing', () => {
    const ms = { id: 'b2', name: 'Sprint', planId: 'p2', orderHint: '' }
    const result = mapMsBucketToDomain(ms, { tenantId: 't1', localPlanId: 'lp2' })
    expect(result.msBucketEtag).toBe('')
  })

  it('defaults name to empty string when missing', () => {
    const ms = { id: 'b3', planId: 'p3', orderHint: ' !' }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = mapMsBucketToDomain(ms as any, { tenantId: 't1', localPlanId: 'lp3' })
    expect(result.name).toBe('')
  })

  it('defaults orderHint to empty string when missing', () => {
    const ms = { id: 'b4', name: 'Done', planId: 'p4' }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = mapMsBucketToDomain(ms as any, { tenantId: 't1', localPlanId: 'lp4' })
    expect(result.orderHint).toBe('')
  })
})
