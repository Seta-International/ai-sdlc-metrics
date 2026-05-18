import { describe, expect, it } from 'vitest'
import { parseMailerConfig } from './mailer-config-schema'

describe('parseMailerConfig (graph)', () => {
  it('parses a valid graph row', () => {
    const r = parseMailerConfig({
      provider: 'graph',
      config: { mailbox_user_id: 'noreply@seta.example', from_address: 'noreply@seta.example' },
    })
    expect(r.provider).toBe('graph')
  })

  it('rejects missing mailbox_user_id', () => {
    expect(() =>
      parseMailerConfig({ provider: 'graph', config: { from_address: 'a@b.c' } } as never),
    ).toThrow()
  })

  it('rejects unknown provider', () => {
    expect(() => parseMailerConfig({ provider: 'smtp', config: {} } as never)).toThrow()
  })
})
