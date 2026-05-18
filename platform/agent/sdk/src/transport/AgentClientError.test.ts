import { describe, expect, it } from 'vitest'
import { AgentClientError } from './AgentClientError'

describe('AgentClientError', () => {
  it('carries kind, status, and body for http errors', () => {
    const e = new AgentClientError({ kind: 'http', status: 401, body: { msg: 'no' } })
    expect(e.kind).toBe('http')
    expect(e.status).toBe(401)
    expect(e.body).toEqual({ msg: 'no' })
    expect(e instanceof Error).toBe(true)
    expect(e.name).toBe('AgentClientError')
  })

  it('exposes kind=network with cause', () => {
    const cause = new TypeError('network down')
    const e = new AgentClientError({ kind: 'network', cause })
    expect(e.kind).toBe('network')
    expect(e.cause).toBe(cause)
  })

  it('exposes kind=parse and kind=abort', () => {
    expect(new AgentClientError({ kind: 'parse', cause: new Error('zod') }).kind).toBe('parse')
    expect(new AgentClientError({ kind: 'abort' }).kind).toBe('abort')
  })
})
