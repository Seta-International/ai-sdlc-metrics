export type SsoProviderId = 'entra' | 'google'

export interface SignInOptions {
  /** Path to send the user back to after callback. Defaults to '/'. */
  returnTo?: string
  /** Override the POST URL (default: `/sso/login/{provider}`). */
  loginUrl?: (provider: SsoProviderId) => string
  /** Override the fetch impl (testing). */
  fetch?: typeof fetch
}

export async function signIn(
  provider: SsoProviderId,
  options: SignInOptions = {},
): Promise<{ url: string }> {
  const fetchImpl = options.fetch ?? fetch
  const url = options.loginUrl?.(provider) ?? `/sso/login/${provider}`
  const res = await fetchImpl(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ returnTo: options.returnTo ?? '/' }),
  })
  if (!res.ok) throw new Error(`sso login ${provider} failed: ${res.status}`)
  return (await res.json()) as { url: string }
}
