export type SsoConnectionTestResult = {
  result: 'ok' | 'discovery_failed' | 'issuer_mismatch' | 'invalid_client' | 'unexpected_error'
  message?: string
}

export async function runSsoConnectionTest(input: {
  entraTenantId: string
  clientId: string
  clientSecret: string
  fetchImpl?: typeof fetch
}): Promise<SsoConnectionTestResult> {
  const fetchImpl = input.fetchImpl ?? fetch
  const discoveryUrl = `https://login.microsoftonline.com/${input.entraTenantId}/v2.0/.well-known/openid-configuration`

  let discovery: { issuer: string; token_endpoint: string }
  try {
    const res = await fetchImpl(discoveryUrl)
    if (!res.ok) return { result: 'discovery_failed', message: `HTTP ${res.status}` }
    discovery = (await res.json()) as { issuer: string; token_endpoint: string }
  } catch (e) {
    return { result: 'discovery_failed', message: (e as Error).message }
  }

  const expectedIssuerPrefix = `https://login.microsoftonline.com/${input.entraTenantId}/`
  if (!discovery.issuer.startsWith(expectedIssuerPrefix)) {
    return { result: 'issuer_mismatch', message: `got ${discovery.issuer}` }
  }

  try {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: input.clientId,
      client_secret: input.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    })
    const res = await fetchImpl(discovery.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (res.ok) return { result: 'ok' }
    if (res.status === 400 || res.status === 401) {
      let msg = `HTTP ${res.status}`
      try {
        const j = (await res.json()) as { error?: string; error_description?: string }
        if (j.error) msg = `${j.error}: ${j.error_description ?? ''}`.trim()
      } catch {
        /* ignore */
      }
      return { result: 'invalid_client', message: msg }
    }
    return { result: 'unexpected_error', message: `HTTP ${res.status}` }
  } catch (e) {
    return { result: 'unexpected_error', message: (e as Error).message }
  }
}
