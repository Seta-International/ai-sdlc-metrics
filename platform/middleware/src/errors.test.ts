import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { ConflictError, DomainError, NotFound, onError } from './errors'

describe('DomainError', () => {
  it('carries an RFC 7807 problem document', () => {
    const e = new DomainError(404, 'thread not found', { detail: 'id was abc' })
    expect(e.problem).toMatchObject({
      type: expect.stringContaining('/errors/404'),
      title: 'thread not found',
      status: 404,
      detail: 'id was abc',
    })
  })

  it('subclasses set status from the constructor', () => {
    expect(new NotFound('Tenant').problem.status).toBe(404)
    expect(new ConflictError('already exists').problem.status).toBe(409)
  })
})

describe('onError', () => {
  it('returns application/problem+json for DomainError', async () => {
    const app = new Hono()
    app.get('/', () => {
      throw new NotFound('Tenant')
    })
    app.onError(onError)
    const res = await app.request('/')
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toMatchObject({ status: 404, title: 'Tenant not found', instance: '/' })
  })

  it('never leaks internals for unknown errors', async () => {
    const app = new Hono()
    app.get('/', () => {
      throw new Error('DB host secret leaked')
    })
    app.onError(onError)
    const res = await app.request('/')
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('secret leaked')
  })
})
