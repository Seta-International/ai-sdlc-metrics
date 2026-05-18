import { describe, expect, it } from 'vitest'
import { magicLinkMessage } from './magic-link'

describe('magicLinkMessage', () => {
  const args = {
    to: 'owner@acme.com',
    link: 'https://app.example/sso/magic/consume?t=abc',
    tenantDisplayName: 'Acme',
    expiresInMin: 10,
  }
  it('produces a subject mentioning the tenant', () => {
    const m = magicLinkMessage(args)
    expect(m.subject).toMatch(/Acme/i)
  })
  it('includes the link verbatim in text body', () => {
    const m = magicLinkMessage(args)
    expect(m.text).toContain(args.link)
    expect(m.text).toMatch(/10 minutes/)
  })
  it('emits matching idempotencyKey for the same link', () => {
    const a = magicLinkMessage(args)
    const b = magicLinkMessage(args)
    expect(a.idempotencyKey).toBe(b.idempotencyKey)
  })
})
