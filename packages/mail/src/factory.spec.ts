import { describe, expect, it } from 'vitest'
import { createMailTransport } from './index'
import { SesTransport } from './transports/ses-transport'
import { SmtpTransport } from './transports/smtp-transport'

describe('createMailTransport', () => {
  it('returns SesTransport for ses provider', () => {
    const transport = createMailTransport({
      provider: 'ses',
      fromAddress: 'noreply@seta.com',
      region: 'ap-southeast-1',
    })
    expect(transport).toBeInstanceOf(SesTransport)
  })

  it('returns SmtpTransport for smtp provider', () => {
    const transport = createMailTransport({
      provider: 'smtp',
      fromAddress: 'noreply@seta.com',
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpUser: 'user',
      smtpPass: 'pass',
    })
    expect(transport).toBeInstanceOf(SmtpTransport)
  })
})
