export type SsoListItem = {
  tenantId: string
  slug: string
  displayName: string
  provider: 'entra' | null
  enabled: boolean
  domainCount: number
}

export type SsoConfigDetail = {
  tenantId: string
  provider: 'entra'
  config: { entra_tenant_id: string; client_id: string }
  enabled: boolean
  hasSecret: boolean
  domains: string[]
  lastTestedAt: string | null
  lastTestResult: string | null
}

export type SsoUpsertInput = {
  provider: 'entra'
  config: { entra_tenant_id: string; client_id: string }
  domains: string[]
  enabled: boolean
  clientSecret?: string
}

export type SsoTestResult = {
  result: 'ok' | 'discovery_failed' | 'issuer_mismatch' | 'invalid_client' | 'unexpected_error'
  message?: string
  testedAt: string
}

export interface Opts {
  fetch?: typeof fetch
  basePath?: string
}

async function req<T>(url: string, init: RequestInit, opts: Opts): Promise<T> {
  const fetchImpl = opts.fetch ?? fetch
  const res = await fetchImpl(`${opts.basePath ?? ''}${url}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${url} failed: ${res.status}`)
  return (await res.json()) as T
}

export const listSsoTenants = (opts: Opts = {}) =>
  req<{ items: SsoListItem[] }>('/admin/sso/tenants', { method: 'GET' }, opts)

export const getSsoTenant = (tenantId: string, opts: Opts = {}) =>
  req<SsoConfigDetail>(`/admin/sso/tenants/${tenantId}`, { method: 'GET' }, opts)

export const upsertSsoTenant = (tenantId: string, body: SsoUpsertInput, opts: Opts = {}) => {
  const payload: Record<string, unknown> = { ...body }
  if (!body.clientSecret) delete payload.clientSecret
  return req<SsoConfigDetail>(
    `/admin/sso/tenants/${tenantId}`,
    { method: 'PUT', body: JSON.stringify(payload) },
    opts,
  )
}

export const deleteSsoTenant = (tenantId: string, opts: Opts = {}) =>
  req<{ ok: true }>(`/admin/sso/tenants/${tenantId}`, { method: 'DELETE' }, opts)

export const testSsoTenant = (tenantId: string, opts: Opts = {}) =>
  req<SsoTestResult>(`/admin/sso/tenants/${tenantId}/test`, { method: 'POST' }, opts)

export const rotateSsoSecret = (tenantId: string, clientSecret: string, opts: Opts = {}) =>
  req<{ ok: true }>(
    `/admin/sso/tenants/${tenantId}/rotate-secret`,
    { method: 'POST', body: JSON.stringify({ clientSecret }) },
    opts,
  )
