import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@future/db'
import { UpsertAiProviderConfigCommand } from './upsert-ai-provider-config.command'
import { UpsertAiProviderConfigHandler } from './upsert-ai-provider-config.handler'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { ISecretsStore } from '../../domain/ports/secrets-store.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000010'
const FAKE_ARN = 'arn:aws:secretsmanager:ap-southeast-1:123456:secret:future/tenant/xxx'

interface MockDb {
  insert: ReturnType<typeof vi.fn>
  values: ReturnType<typeof vi.fn>
  onConflictDoUpdate: ReturnType<typeof vi.fn>
}

function makeDb(): { db: Db; mock: MockDb } {
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined)
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate })
  const insert = vi.fn().mockReturnValue({ values })
  return {
    db: { insert } as unknown as Db,
    mock: { insert, values, onConflictDoUpdate },
  }
}

describe('UpsertAiProviderConfigHandler', () => {
  let handler: UpsertAiProviderConfigHandler
  let mock: MockDb
  let auditFacade: Pick<KernelAuditFacade, 'recordEvent'>
  let secretsStore: ISecretsStore

  beforeEach(() => {
    const made = makeDb()
    mock = made.mock
    auditFacade = { recordEvent: vi.fn().mockResolvedValue(undefined) }
    secretsStore = {
      putSecret: vi.fn().mockResolvedValue({ ref: FAKE_ARN }),
      getSecret: vi.fn(),
      deleteSecret: vi.fn(),
    }
    handler = new UpsertAiProviderConfigHandler(
      made.db,
      secretsStore,
      auditFacade as unknown as KernelAuditFacade,
    )
  })

  describe('on create/rotate', () => {
    it('stores API key in secrets manager and saves only ref in DB', async () => {
      const command = new UpsertAiProviderConfigCommand(
        TENANT_ID,
        ACTOR_ID,
        'sk-test-abcd1234',
        'openai',
        'gpt-5.4',
        'gpt-5.4-nano',
        'text-embedding-3-small',
      )

      await handler.execute(command)

      expect(secretsStore.putSecret).toHaveBeenCalledWith({
        name: `future/tenant/${TENANT_ID}/ai-provider-api-key`,
        value: 'sk-test-abcd1234',
      })
      expect(mock.values).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKeyRef: FAKE_ARN,
          apiKeyLastFour: '1234',
        }),
      )
      // Raw API key must NEVER appear in DB values
      const dbValues = mock.values.mock.calls[0][0]
      expect(JSON.stringify(dbValues)).not.toContain('sk-test-abcd1234')
    })

    it('extracts last four digits of raw key for display', async () => {
      const command = new UpsertAiProviderConfigCommand(
        TENANT_ID,
        ACTOR_ID,
        'sk-proj-WXYZ',
        'openai',
        'gpt-5.4',
        'gpt-5.4-nano',
        'text-embedding-3-small',
      )

      await handler.execute(command)

      expect(mock.values).toHaveBeenCalledWith(expect.objectContaining({ apiKeyLastFour: 'WXYZ' }))
    })

    it('writes audit with provider type and last four (no raw key)', async () => {
      const command = new UpsertAiProviderConfigCommand(
        TENANT_ID,
        ACTOR_ID,
        'sk-some-key-5678',
        'openai',
        'gpt-5.4',
        'gpt-5.4-nano',
        'text-embedding-3-small',
      )

      await handler.execute(command)

      expect(auditFacade.recordEvent).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        eventType: 'admin.ai_config_upserted',
        module: 'admin',
        subjectId: TENANT_ID,
        payload: {
          providerType: 'openai',
          apiKeyLastFour: '5678',
        },
      })
      // Audit payload must NOT contain raw key
      const auditCall = vi.mocked(auditFacade.recordEvent).mock.calls[0]![0]
      expect(JSON.stringify(auditCall.payload)).not.toContain('sk-some-key-5678')
    })

    it('saves status as needs_attention on upsert', async () => {
      const command = new UpsertAiProviderConfigCommand(
        TENANT_ID,
        ACTOR_ID,
        'sk-key-0000',
        'openai',
        'gpt-5.4',
        'gpt-5.4-nano',
        'text-embedding-3-small',
      )

      await handler.execute(command)

      expect(mock.values).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'needs_attention' }),
      )
    })
  })
})
