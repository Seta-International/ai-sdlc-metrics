import { describe, expect, it } from 'vitest'
import {
  GraphNotFound,
  GraphPermissionDenied,
  GraphPreconditionFailed,
  GraphRateLimited,
  GraphUnauthorized,
  GraphUnavailable,
} from './errors'

describe('Graph error taxonomy', () => {
  it('GraphNotFound is a 404', () => {
    const e = new GraphNotFound('/me/planner/tasks/x')
    expect(e.status).toBe(404)
    expect(e.message).toMatch(/not found/i)
  })
  it('GraphPreconditionFailed is a 412', () => {
    expect(new GraphPreconditionFailed('task changed').status).toBe(412)
  })
  it('GraphPermissionDenied is a 403', () => {
    expect(new GraphPermissionDenied().status).toBe(403)
  })
  it('GraphRateLimited is a 429 with retryAfterSec', () => {
    const e = new GraphRateLimited(42)
    expect(e.status).toBe(429)
    expect(e.retryAfterSec).toBe(42)
  })
  it('GraphUnavailable is a 503', () => {
    expect(new GraphUnavailable('network').status).toBe(503)
  })
  it('GraphUnauthorized is a 401', () => {
    expect(new GraphUnauthorized().status).toBe(401)
  })
})
