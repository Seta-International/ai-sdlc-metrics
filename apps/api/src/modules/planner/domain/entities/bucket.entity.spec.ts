import { describe, expect, it } from 'vitest'
import { uuidv7 } from 'uuidv7'
import { Bucket } from './bucket.entity'

describe('Bucket', () => {
  const makeBucket = () =>
    Bucket.create({
      id: uuidv7(),
      tenantId: uuidv7(),
      planId: uuidv7(),
      name: 'Backlog',
      orderHint: ' !',
    })

  it('Bucket.create() returns a bucket with correct fields', () => {
    const id = uuidv7()
    const tenantId = uuidv7()
    const planId = uuidv7()
    const bucket = Bucket.create({ id, tenantId, planId, name: 'Todo', orderHint: ' !' })

    expect(bucket.id).toBe(id)
    expect(bucket.tenantId).toBe(tenantId)
    expect(bucket.planId).toBe(planId)
    expect(bucket.name).toBe('Todo')
    expect(bucket.orderHint).toBe(' !')
    expect(bucket.msBucketId).toBeNull()
    expect(bucket.msBucketEtag).toBeNull()
    expect(bucket.createdAt).toBeInstanceOf(Date)
    expect(bucket.deletedAt).toBeNull()
  })

  it('rename() updates the name', () => {
    const bucket = makeBucket()
    bucket.rename('In Progress')
    expect(bucket.name).toBe('In Progress')
  })

  it('reorder() updates the orderHint', () => {
    const bucket = makeBucket()
    bucket.reorder(' ! !')
    expect(bucket.orderHint).toBe(' ! !')
  })
})
