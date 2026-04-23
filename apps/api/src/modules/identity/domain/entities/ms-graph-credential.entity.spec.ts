import { describe, expect, it } from 'vitest'
import { MsGraphCredentialEntity } from './ms-graph-credential.entity'

describe('MsGraphCredentialEntity', () => {
  const base = {
    tenantId: 't1',
    clientId: 'c',
    clientSecretRef: 'arn',
    tenantAdId: 'aad-1',
    scopes: ['Tasks.ReadWrite.All'],
    consentedAt: new Date(),
  }

  it('defaults status to active', () => {
    const cred = MsGraphCredentialEntity.create(base)

    expect(cred.status).toBe('active')
  })

  it('markInvalid sets status and error', () => {
    const cred = MsGraphCredentialEntity.create(base)

    cred.markInvalid('invalid_grant')

    expect(cred.status).toBe('invalid')
    expect(cred.lastError).toBe('invalid_grant')
  })

  it('markActive clears error', () => {
    const cred = MsGraphCredentialEntity.create(base)
    cred.markInvalid('x')

    cred.markActive()

    expect(cred.status).toBe('active')
    expect(cred.lastError).toBeNull()
  })
})
