import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MicrosoftOAuthTokenExchanger } from './microsoft-oauth-token-exchanger'
import type { OAuthTokenExchangeInput } from '../../domain/ports/oauth-token-exchanger.port'

const INPUT: OAuthTokenExchangeInput = {
  tokenEndpoint: 'https://login.microsoftonline.com/aad-dir-id/oauth2/v2.0/token',
  clientId: 'client-id-123',
  clientSecret: 'client-secret-value',
  code: 'auth-code-abc',
  redirectUri: 'http://localhost:3000/auth/callback/microsoft',
  scope: 'openid profile email',
}

describe('MicrosoftOAuthTokenExchanger', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let exchanger: MicrosoftOAuthTokenExchanger

  beforeEach(() => {
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    exchanger = new MicrosoftOAuthTokenExchanger()
  })

  it('POSTs to the token endpoint with authorization_code grant', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id_token: 'id-tok',
        access_token: 'acc-tok',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    })

    const result = await exchanger.exchange(INPUT)

    expect(result.idToken).toBe('id-tok')
    expect(result.accessToken).toBe('acc-tok')
    expect(result.tokenType).toBe('Bearer')
    expect(result.expiresIn).toBe(3600)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(INPUT.tokenEndpoint)
    expect(init.method).toBe('POST')

    const body = String(init.body)
    expect(body).toContain('grant_type=authorization_code')
    expect(body).toContain('client_id=client-id-123')
    expect(body).toContain('client_secret=client-secret-value')
    expect(body).toContain('code=auth-code-abc')
    expect(body).toContain(
      'redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback%2Fmicrosoft',
    )
    expect(body).toContain('scope=openid+profile+email')
  })

  it('throws on non-2xx response with body text included', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({ error: 'invalid_grant', error_description: 'code expired' }),
    })

    await expect(exchanger.exchange(INPUT)).rejects.toThrow(/invalid_grant/)
  })

  it('throws when id_token is missing from the response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'acc-tok',
        token_type: 'Bearer',
        expires_in: 3600,
        // id_token deliberately missing
      }),
    })

    await expect(exchanger.exchange(INPUT)).rejects.toThrow(/id_token/)
  })
})
