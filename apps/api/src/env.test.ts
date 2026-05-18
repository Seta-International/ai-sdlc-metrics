import { describe, expect, it } from 'vitest'
import { EnvSchema } from './env'

const baseEnv = {
  NODE_ENV: 'test',
  PORT: '8080',
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  PUBLIC_BASE_URL: 'http://localhost:8080',
  ENTRA_CLIENT_ID: 'entra-client',
  ENTRA_CLIENT_SECRET: 'entra-secret',
  KMS_PROVIDER: 'env',
  DEV_DEK_BASE64: 'AAAA',
  CONTINUATION_HMAC_KEY: '0'.repeat(64),
  MS_BOT_ID: 'bot',
  MS_BOT_SECRET: 'bot-secret',
  MS_BOT_TENANT_ID: 'bot-tenant',
  SESSION_HMAC_KEY: 'a'.repeat(32),
  SESSION_TTL_SEC: '86400',
}

describe('apps/api env', () => {
  it('accepts a complete, valid env', () => {
    const parsed = EnvSchema.parse(baseEnv)
    expect(parsed.ENTRA_CLIENT_ID).toBe('entra-client')
    expect(parsed.SESSION_TTL_SEC).toBe(86400)
    expect(parsed.SESSION_HMAC_KEY.length).toBe(32)
  })

  it('rejects when ENTRA_CLIENT_ID is missing', () => {
    const { ENTRA_CLIENT_ID: _, ...rest } = baseEnv
    expect(() => EnvSchema.parse(rest)).toThrow()
  })

  it('rejects when ENTRA_CLIENT_SECRET is missing', () => {
    const { ENTRA_CLIENT_SECRET: _, ...rest } = baseEnv
    expect(() => EnvSchema.parse(rest)).toThrow()
  })

  it('rejects when GOOGLE_CLIENT_ID is set', () => {
    expect(() => EnvSchema.parse({ ...baseEnv, GOOGLE_CLIENT_ID: 'x' })).toThrow()
  })

  it('rejects when GOOGLE_CLIENT_SECRET is set', () => {
    expect(() => EnvSchema.parse({ ...baseEnv, GOOGLE_CLIENT_SECRET: 'x' })).toThrow()
  })

  it('rejects SESSION_HMAC_KEY shorter than 32 chars', () => {
    expect(() => EnvSchema.parse({ ...baseEnv, SESSION_HMAC_KEY: 'short' })).toThrow()
  })

  it('rejects SESSION_TTL_SEC of 0', () => {
    expect(() => EnvSchema.parse({ ...baseEnv, SESSION_TTL_SEC: '0' })).toThrow()
  })

  it('rejects negative SESSION_TTL_SEC', () => {
    expect(() => EnvSchema.parse({ ...baseEnv, SESSION_TTL_SEC: '-1' })).toThrow()
  })

  it('defaults SESSION_TTL_SEC to 86400 when omitted', () => {
    const { SESSION_TTL_SEC: _, ...rest } = baseEnv
    const parsed = EnvSchema.parse(rest)
    expect(parsed.SESSION_TTL_SEC).toBe(86400)
  })

  it('rejects when PUBLIC_BASE_URL is not a URL', () => {
    expect(() => EnvSchema.parse({ ...baseEnv, PUBLIC_BASE_URL: 'not-a-url' })).toThrow()
  })

  it('rejects when SESSION_HMAC_KEY is missing', () => {
    const { SESSION_HMAC_KEY: _, ...rest } = baseEnv
    expect(() => EnvSchema.parse(rest)).toThrow()
  })
})
