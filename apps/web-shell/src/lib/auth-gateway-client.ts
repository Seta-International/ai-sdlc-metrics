/**
 * auth-gateway-client — thin fetch wrapper for the identity.auth tRPC procedures.
 *
 * These procedures are public (no session required) and are called from:
 *   - The login page (getLoginOptions, startOAuth) — client-side
 *   - The Microsoft callback route (completeOAuth) — server-side
 *
 * We use raw fetch rather than the full @future/api-client tRPC proxy because
 * web-shell is a standalone Next.js zone and the full typed client would pull in
 * the entire API bundle. The wire format is tRPC v11 HTTP (JSON).
 */

import { API_BASE_URL } from './auth-config'

// ---------------------------------------------------------------------------
// Response shapes (subset of what the API returns)
// ---------------------------------------------------------------------------

export interface LoginOptionsTenant {
  id: string
  slug: string
  name: string
  status: 'active' | 'suspended' | 'cancelled'
}

export interface LoginOptionsMethod {
  /** Provider entity UUID — used as `providerId` input to startOAuth */
  id: string
  /** Provider type — currently only 'microsoft' is wired up in auth-gateway */
  type: string
  /** Human-readable name for the provider, e.g. "Seta Microsoft" */
  displayName: string
  /** OAuth app registration client ID (informational only — not passed to startOAuth) */
  clientId: string
  directoryId: string | null
  status: 'ready' | 'needs_attention'
}

export interface LoginOptionsResult {
  tenant: LoginOptionsTenant
  methods: LoginOptionsMethod[]
}

export interface StartOAuthResult {
  authorizationUrl: string
}

export interface CompleteOAuthResult {
  sessionToken: string
  redirectTo: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface TrpcResponse<T> {
  result?: { data?: { json?: T } }
  error?: { message?: string; code?: string }
}

/**
 * Call a tRPC query procedure via HTTP GET with `input` encoded as JSON in
 * the query string (tRPC v11 wire format).
 */
async function trpcQuery<T>(procedure: string, input: unknown): Promise<T> {
  const url = new URL(`${API_BASE_URL}/trpc/${procedure}`)
  url.searchParams.set('input', JSON.stringify({ json: input }))

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!res.ok && !res.headers.get('content-type')?.includes('application/json')) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`)
  }

  const body = (await res.json()) as TrpcResponse<T>

  if (body.error) {
    throw new Error(body.error.message ?? `tRPC error from ${procedure}`)
  }

  const data = body.result?.data?.json
  if (data === undefined || data === null) {
    // null means "not found" for optional queries (e.g. getLoginOptions returns null when tenant unknown)
    return data as T
  }

  return data
}

/**
 * Call a tRPC mutation procedure via HTTP POST (tRPC v11 wire format).
 */
async function trpcMutation<T>(procedure: string, input: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/trpc/${procedure}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: input }),
  })

  if (!res.ok && !res.headers.get('content-type')?.includes('application/json')) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`)
  }

  const body = (await res.json()) as TrpcResponse<T>

  if (body.error) {
    throw new Error(body.error.message ?? `tRPC error from ${procedure}`)
  }

  const data = body.result?.data?.json
  if (data === undefined) {
    throw new Error(`Unexpected empty response from ${procedure}`)
  }

  return data as T
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve public login options for a tenant identified by org slug or email domain.
 * Returns null when the tenant cannot be found.
 */
export async function getLoginOptions(
  opts: { slug: string; emailDomain?: never } | { emailDomain: string; slug?: never },
): Promise<LoginOptionsResult | null> {
  return trpcQuery<LoginOptionsResult | null>('identity.auth.getLoginOptions', {
    slug: opts.slug ?? null,
    emailDomain: opts.emailDomain ?? null,
  })
}

/**
 * Initiate a Microsoft OAuth authorization code flow for the given tenant IdP.
 * Returns the authorization URL to redirect the user to.
 */
export async function startOAuth(input: {
  tenantId: string
  providerId: string
  callbackUri: string
  redirectTo: string
}): Promise<StartOAuthResult> {
  return trpcMutation<StartOAuthResult>('identity.auth.startOAuth', input)
}

/**
 * Complete the OAuth authorization code flow and issue a Future session token.
 * Called from the server-side Microsoft callback route.
 */
export async function completeOAuth(input: {
  code: string
  state: string
  callbackUri: string
}): Promise<CompleteOAuthResult> {
  return trpcMutation<CompleteOAuthResult>('identity.auth.completeOAuth', input)
}
