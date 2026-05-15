import { QueryClient } from '@tanstack/react-query'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { meQueryOptions } from '../api/queries'
import { server } from '../test/msw-server'

describe('_authed beforeLoad', () => {
  it('rejects when /me is 401', async () => {
    server.use(http.get('*/me', () => new HttpResponse(null, { status: 401 })))
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await expect(qc.ensureQueryData(meQueryOptions)).rejects.toBeDefined()
  })

  it('resolves /me when authenticated', async () => {
    server.use(
      http.get('*/me', () =>
        HttpResponse.json({
          user: { id: 'u1', email: 'a@b.test', name: 'A', pictureUrl: null },
          tenants: [{ id: 't1', name: 'Acme', role: 'admin' }],
          csrfToken: 'csrf-1',
        }),
      ),
    )
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const me = await qc.ensureQueryData(meQueryOptions)
    expect(me.tenants).toHaveLength(1)
    expect(me.user.id).toBe('u1')
  })
})
