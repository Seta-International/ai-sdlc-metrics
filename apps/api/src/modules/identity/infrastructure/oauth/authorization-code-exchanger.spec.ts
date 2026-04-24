import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthorizationCodeExchanger } from './authorization-code-exchanger'
import type { OAuthTokenExchangeInput } from '../../domain/ports/oauth-token-exchanger.port'

const MICROSOFT_INPUT: OAuthTokenExchangeInput = {
  tokenEndpoint: 'https://login.microsoftonline.com/aad-dir-id/oauth2/v2.0/token',
  clientId: 'client-id-123',
  clientSecret: 'client-secret-value',
  code: 'auth-code-abc',
  redirectUri: 'http://localhost:3000/auth/callback/microsoft',
  scope: 'openid profile email',
}

const GOOGLE_INPUT: OAuthTokenExchangeInput = {
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  clientId: 'google-client-id-123',
  clientSecret: 'google-client-secret-value',
  code: 'google-auth-code-abc',
  redirectUri: 'http://localhost:3000/auth/callback/google',
  scope: 'openid profile email',
}

describe('AuthorizationCodeExchanger', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let exchanger: AuthorizationCodeExchanger

  beforeEach(() => {
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    exchanger = new AuthorizationCodeExchanger()
  })

  describe('Microsoft-like token endpoint', () => {
    it('POSTs to the Microsoft token endpoint with authorization_code grant', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          id_token: 'ms-id-tok',
          access_token: 'ms-acc-tok',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      })

      const result = await exchanger.exchange(MICROSOFT_INPUT)

      expect(result.idToken).toBe('ms-id-tok')
      expect(result.accessToken).toBe('ms-acc-tok')
      expect(result.tokenType).toBe('Bearer')
      expect(result.expiresIn).toBe(3600)

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(MICROSOFT_INPUT.tokenEndpoint)
      expect(init.method).toBe('POST')
      expect((init.headers as Record<string, string>)['Content-Type']).toBe(
        'application/x-www-form-urlencoded',
      )

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

      await expect(exchanger.exchange(MICROSOFT_INPUT)).rejects.toThrow(/invalid_grant/)
    })

    it('throws when id_token is missing from the Microsoft response', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'acc-tok',
          token_type: 'Bearer',
          expires_in: 3600,
          // id_token deliberately missing
        }),
      })

      await expect(exchanger.exchange(MICROSOFT_INPUT)).rejects.toThrow(/id_token/)
    })
  })

  describe('Google-like token endpoint', () => {
    it('POSTs to the Google token endpoint with authorization_code grant', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          id_token: 'google-id-tok',
          access_token: 'google-acc-tok',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      })

      const result = await exchanger.exchange(GOOGLE_INPUT)

      expect(result.idToken).toBe('google-id-tok')
      expect(result.accessToken).toBe('google-acc-tok')
      expect(result.tokenType).toBe('Bearer')
      expect(result.expiresIn).toBe(3600)

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(GOOGLE_INPUT.tokenEndpoint)
      expect(init.method).toBe('POST')
      expect((init.headers as Record<string, string>)['Content-Type']).toBe(
        'application/x-www-form-urlencoded',
      )

      const body = String(init.body)
      expect(body).toContain('grant_type=authorization_code')
      expect(body).toContain('client_id=google-client-id-123')
      expect(body).toContain('client_secret=google-client-secret-value')
      expect(body).toContain('code=google-auth-code-abc')
      expect(body).toContain(
        'redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback%2Fgoogle',
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

      await expect(exchanger.exchange(GOOGLE_INPUT)).rejects.toThrow(/invalid_grant/)
    })

    it('throws when id_token is missing from the Google response', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'acc-tok',
          token_type: 'Bearer',
          expires_in: 3600,
          // id_token deliberately missing
        }),
      })

      await expect(exchanger.exchange(GOOGLE_INPUT)).rejects.toThrow(/id_token/)
    })
  })
})
