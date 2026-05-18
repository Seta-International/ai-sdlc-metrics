import { describe, expect, it, vi } from 'vitest'
import { type AuditWriter, recordSsoAudit } from './admin-audit'

describe('recordSsoAudit', () => {
  it('forwards a normalised event to audit.recordAudit', async () => {
    const recordAudit = vi.fn(async () => {})
    const writer: AuditWriter = { recordAudit }
    await recordSsoAudit(writer, {
      event: 'sso.config_updated',
      actorUserId: 'u-1',
      tenantId: 't-1',
      metadata: { fieldsChanged: ['client_id'] },
    })
    expect(recordAudit).toHaveBeenCalledWith({
      tenantId: 't-1',
      actor: { type: 'user', userId: 'u-1' },
      providerId: 'entra',
      operation: 'sso.config_updated',
      result: 'ok',
      metadata: { fieldsChanged: ['client_id'] },
    })
  })

  it('defaults metadata to {} and result to ok', async () => {
    const recordAudit = vi.fn(async () => {})
    await recordSsoAudit(
      { recordAudit },
      {
        event: 'sso.domain_added',
        actorUserId: 'u-1',
        tenantId: 't-1',
      },
    )
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'ok', metadata: {} }),
    )
  })

  it('forwards failure result when provided', async () => {
    const recordAudit = vi.fn(async () => {})
    await recordSsoAudit(
      { recordAudit },
      {
        event: 'sso.test_run',
        actorUserId: 'u-1',
        tenantId: 't-1',
        result: 'failure',
      },
    )
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ result: 'failure' }))
  })
})
