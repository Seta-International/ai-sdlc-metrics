import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { meQueryOptions, useMe } from './useMe'

const fetchMock = vi.fn()
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const mkWrapper =
  () =>
  ({ children }: { children: ReactNode }) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }

// RFC 4122 v4 UUIDs (version nibble = 4, variant nibble = 8-b)
const USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
const TENANT_ID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'
const SUPERADMIN_ID = 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'

const memberPayload = {
  user: { id: USER_ID, email: 'a@x.com', name: 'A', pictureUrl: null },
  tenant: { id: TENANT_ID, slug: 'acme', name: 'Acme', isAdmin: true },
  isSuperadmin: false,
  apps: ['studio'],
  csrfToken: 'tok',
}

describe('meQueryOptions.queryFn', () => {
  it('returns parsed payload on 200', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(memberPayload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const result = await meQueryOptions.queryFn({ signal: new AbortController().signal } as never)
    expect(result.tenant?.slug).toBe('acme')
    expect(result.isSuperadmin).toBe(false)
    expect(result.apps).toEqual(['studio'])
  })

  it('returns parsed payload for superadmin (tenant null)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          user: { id: SUPERADMIN_ID, email: 's@x.com', name: 'S', pictureUrl: null },
          tenant: null,
          isSuperadmin: true,
          apps: [],
          csrfToken: 'tok',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const result = await meQueryOptions.queryFn({ signal: new AbortController().signal } as never)
    expect(result.isSuperadmin).toBe(true)
    expect(result.tenant).toBeNull()
  })

  it('throws on 401', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }))
    await expect(
      meQueryOptions.queryFn({ signal: new AbortController().signal } as never),
    ).rejects.toMatchObject({ message: 'me 401' })
  })
})

describe('useMe', () => {
  it('loads /me and exposes data', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(memberPayload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const { result } = renderHook(() => useMe(), { wrapper: mkWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.tenant?.slug).toBe('acme')
  })

  it('exposes isError when /me returns 401', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }))
    const { result } = renderHook(() => useMe(), { wrapper: mkWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toMatch(/401/)
  })
})
