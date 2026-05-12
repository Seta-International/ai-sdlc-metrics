import { describe, expect, it } from 'vitest'
import { classifyBatchItem } from './_classify'

describe('classifyBatchItem', () => {
  it('200 → ok with etag and raw body', () => {
    const result = classifyBatchItem({
      id: 'T1',
      status: 200,
      etag: 'W/"etag1"',
      body: { id: 'T1', title: 'Task' },
    })
    expect(result.taskId).toBe('T1')
    expect(result.status).toBe('ok')
    expect(result.newEtag).toBe('W/"etag1"')
    expect(result.raw).toEqual({ id: 'T1', title: 'Task' })
  })

  it('201 → ok', () => {
    const result = classifyBatchItem({
      id: 'T2',
      status: 201,
      etag: 'W/"etag2"',
      body: { id: 'T2' },
    })
    expect(result.taskId).toBe('T2')
    expect(result.status).toBe('ok')
  })

  it('412 → conflict with reason', () => {
    const result = classifyBatchItem({ id: 'T3', status: 412, etag: null })
    expect(result.taskId).toBe('T3')
    expect(result.status).toBe('conflict')
    expect(result.reason).toBe('task changed since you looked')
  })

  it('403 → forbidden with reason', () => {
    const result = classifyBatchItem({ id: 'T4', status: 403, etag: null })
    expect(result.taskId).toBe('T4')
    expect(result.status).toBe('forbidden')
    expect(result.reason).toBe('you no longer have access')
  })

  it('404 → missing with reason', () => {
    const result = classifyBatchItem({ id: 'T5', status: 404, etag: null })
    expect(result.taskId).toBe('T5')
    expect(result.status).toBe('missing')
    expect(result.reason).toBe('task no longer exists')
  })

  it('429 → rate_limited with reason', () => {
    const result = classifyBatchItem({ id: 'T6', status: 429, etag: null })
    expect(result.taskId).toBe('T6')
    expect(result.status).toBe('rate_limited')
    expect(result.reason).toBe('try again in a moment')
  })

  it('500 → failed with graph status reason', () => {
    const result = classifyBatchItem({ id: 'T7', status: 500, etag: null })
    expect(result.taskId).toBe('T7')
    expect(result.status).toBe('failed')
    expect(result.reason).toBe('graph status 500')
  })

  it('503 → failed with graph status reason', () => {
    const result = classifyBatchItem({ id: 'T8', status: 503, etag: null })
    expect(result.taskId).toBe('T8')
    expect(result.status).toBe('failed')
    expect(result.reason).toBe('graph status 503')
  })

  it('uses taskId override over item.id when provided', () => {
    const result = classifyBatchItem({ id: 'batch-0', status: 200, etag: null, taskId: 'REAL-ID' })
    expect(result.taskId).toBe('REAL-ID')
  })
})
