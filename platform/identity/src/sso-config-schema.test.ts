import { describe, expect, it } from 'vitest'
import { parseSsoConfig, SsoConfigDiscriminated } from './sso-config-schema'

describe('parseSsoConfig (entra)', () => {
  it('parses a valid entra row', () => {
    const r = parseSsoConfig({
      provider: 'entra',
      config: { entra_tenant_id: '11111111-2222-3333-4444-555555555555', client_id: 'abc' },
    })
    expect(r.provider).toBe('entra')
    expect(r.config.entra_tenant_id).toMatch(/^[0-9a-f-]+$/)
  })

  it('rejects missing entra_tenant_id', () => {
    expect(() => parseSsoConfig({ provider: 'entra', config: { client_id: 'abc' } })).toThrow()
  })

  it('rejects unknown provider', () => {
    expect(() => parseSsoConfig({ provider: 'okta', config: {} } as never)).toThrow()
  })
})

describe('SsoConfigDiscriminated', () => {
  it('exposes provider as the discriminator', () => {
    const parsed = SsoConfigDiscriminated.safeParse({
      provider: 'entra',
      config: { entra_tenant_id: 't', client_id: 'c' },
    })
    expect(parsed.success).toBe(true)
  })
})
