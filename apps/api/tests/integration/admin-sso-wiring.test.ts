import { describe, expect, it } from 'vitest'
import { buildApp } from '../../src/main'

describe('admin-sso wiring', () => {
  it('requires authentication on /admin/sso/tenants', async () => {
    const app = buildApp()
    const res = await app.request('/admin/sso/tenants')
    expect(res.status).toBe(401)
  })
})
