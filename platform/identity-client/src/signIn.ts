export type SsoProviderId = 'entra'

export type DiscoverHit = {
  ok: true
  provider: 'entra'
  tenantSlug: string
  displayName: string
}
export type DiscoverMiss = { ok: false; error: 'no_workspace_for_email' }
export type DiscoverResult = DiscoverHit | DiscoverMiss

export interface SignInOptions {
  returnTo?: string
  fetch?: typeof fetch
  /** Override base path (rarely needed). */
  basePath?: string
}

export async function discover(email: string, opts: SignInOptions = {}): Promise<DiscoverResult> {
  const fetchImpl = opts.fetch ?? fetch
  const url = `${opts.basePath ?? ''}/sso/discover`
  const res = await fetchImpl(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) throw new Error(`sso discover failed: ${res.status}`)
  return (await res.json()) as DiscoverResult
}

export async function start(email: string, opts: SignInOptions = {}): Promise<{ url: string }> {
  const fetchImpl = opts.fetch ?? fetch
  const url = `${opts.basePath ?? ''}/sso/start`
  const res = await fetchImpl(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, returnTo: opts.returnTo ?? '/' }),
  })
  if (!res.ok) throw new Error(`sso start failed: ${res.status}`)
  return (await res.json()) as { url: string }
}
