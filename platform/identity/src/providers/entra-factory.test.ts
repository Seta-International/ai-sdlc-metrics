import { describe, expect, it } from 'vitest'
import { ssoProviderFor } from './entra-factory'

describe('ssoProviderFor', () => {
  it('returns an EntraSsoProvider for provider=entra', () => {
    const p = ssoProviderFor(
      { provider: 'entra', config: { entra_tenant_id: 'tid', client_id: 'cid' } },
      'secret',
    )
    expect(p.id).toBe('entra')
  })

  it('throws Unreachable for unknown provider', () => {
    expect(() => ssoProviderFor({ provider: 'okta', config: {} } as never, 'secret')).toThrow(
      /Unreachable|unknown provider/i,
    )
  })
})
