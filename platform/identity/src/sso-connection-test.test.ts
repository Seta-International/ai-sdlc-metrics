import { describe, expect, it } from 'vitest'
import { runSsoConnectionTest } from './sso-connection-test'

const entraTenantId = '11111111-2222-3333-4444-555555555555'

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

describe('runSsoConnectionTest', () => {
  it('returns ok on discovery + client_credentials success', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = urlOf(input)
      if (url.endsWith('/.well-known/openid-configuration')) {
        return new Response(
          JSON.stringify({
            issuer: `https://login.microsoftonline.com/${entraTenantId}/v2.0`,
            token_endpoint: `https://login.microsoftonline.com/${entraTenantId}/oauth2/v2.0/token`,
            authorization_endpoint: 'x',
            jwks_uri: 'x',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      if (url.endsWith('/oauth2/v2.0/token')) {
        return new Response(JSON.stringify({ access_token: 'tok' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error(`unexpected fetch ${url}`)
    }
    const r = await runSsoConnectionTest({
      entraTenantId,
      clientId: 'cid',
      clientSecret: 'sec',
      fetchImpl,
    })
    expect(r.result).toBe('ok')
  })

  it('returns discovery_failed when the discovery doc 404s', async () => {
    const fetchImpl: typeof fetch = async () => new Response('not found', { status: 404 })
    const r = await runSsoConnectionTest({
      entraTenantId,
      clientId: 'cid',
      clientSecret: 'sec',
      fetchImpl,
    })
    expect(r.result).toBe('discovery_failed')
  })

  it('returns issuer_mismatch when issuer does not include the configured tenant id', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = urlOf(input)
      if (url.endsWith('/.well-known/openid-configuration')) {
        return new Response(
          JSON.stringify({
            issuer: 'https://login.microsoftonline.com/SOMETHING-ELSE/v2.0',
            token_endpoint: 'https://login.microsoftonline.com/SOMETHING-ELSE/oauth2/v2.0/token',
            authorization_endpoint: 'x',
            jwks_uri: 'x',
          }),
          { status: 200 },
        )
      }
      throw new Error(`unexpected fetch ${url}`)
    }
    const r = await runSsoConnectionTest({
      entraTenantId,
      clientId: 'cid',
      clientSecret: 'sec',
      fetchImpl,
    })
    expect(r.result).toBe('issuer_mismatch')
  })

  it('returns invalid_client on AADSTS70011-style 401', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = urlOf(input)
      if (url.endsWith('/.well-known/openid-configuration')) {
        return new Response(
          JSON.stringify({
            issuer: `https://login.microsoftonline.com/${entraTenantId}/v2.0`,
            token_endpoint: `https://login.microsoftonline.com/${entraTenantId}/oauth2/v2.0/token`,
            authorization_endpoint: 'x',
            jwks_uri: 'x',
          }),
          { status: 200 },
        )
      }
      return new Response(
        JSON.stringify({ error: 'invalid_client', error_description: 'AADSTS7000215...' }),
        { status: 401 },
      )
    }
    const r = await runSsoConnectionTest({
      entraTenantId,
      clientId: 'cid',
      clientSecret: 'wrong',
      fetchImpl,
    })
    expect(r.result).toBe('invalid_client')
  })

  it('returns unexpected_error on a 5xx', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = urlOf(input)
      if (url.endsWith('/.well-known/openid-configuration')) {
        return new Response(
          JSON.stringify({
            issuer: `https://login.microsoftonline.com/${entraTenantId}/v2.0`,
            token_endpoint: `https://login.microsoftonline.com/${entraTenantId}/oauth2/v2.0/token`,
            authorization_endpoint: 'x',
            jwks_uri: 'x',
          }),
          { status: 200 },
        )
      }
      return new Response('boom', { status: 503 })
    }
    const r = await runSsoConnectionTest({
      entraTenantId,
      clientId: 'cid',
      clientSecret: 'sec',
      fetchImpl,
    })
    expect(r.result).toBe('unexpected_error')
  })
})
