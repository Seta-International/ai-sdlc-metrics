import { describe, expect, it, vi } from 'vitest'
import { ForbiddenException } from '@nestjs/common'
import type { Db } from '@future/db'
import { GetTenantAdminSummaryQuery } from './get-tenant-admin-summary.query'
import { GetTenantAdminSummaryHandler } from './get-tenant-admin-summary.handler'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const OTHER_TENANT_ID = '01900000-0000-7000-8000-000000000002'
const ACTOR_ID = '01900000-0000-7000-8000-000000000010'

const makeTenant = (id = TENANT_ID) => ({
  id,
  slug: 'acme',
  name: 'Acme Corp',
  status: 'active' as const,
  planTier: 'professional' as const,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-06-01'),
})

const makeAiRow = (tenantId = TENANT_ID) => ({
  id: 'ai-row-1',
  tenantId,
  providerType: 'openai' as const,
  apiKeyRef: 'arn:aws:secretsmanager:ap-southeast-1:123:secret:future/tenant/xxx',
  apiKeyLastFour: '4321',
  defaultReasoningModel: 'gpt-5.4',
  defaultClassificationModel: 'gpt-5.4-nano',
  embeddingModel: 'text-embedding-3-small',
  status: 'ready' as const,
  lastValidatedAt: new Date('2025-06-01'),
  lastError: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-06-01'),
})

function makeDb(aiRows: unknown[] = [], toggleRows: unknown[] = []): Db {
  let selectCallCount = 0
  const select = vi.fn().mockImplementation(() => {
    selectCallCount++
    if (selectCallCount === 1) {
      // first select → ai config (needs limit)
      const lim = vi.fn().mockResolvedValue(aiRows)
      const wh = vi.fn().mockReturnValue({ limit: lim })
      return { from: vi.fn().mockReturnValue({ where: wh }) }
    } else {
      // second select → module toggles (no limit)
      const wh = vi.fn().mockResolvedValue(toggleRows)
      return { from: vi.fn().mockReturnValue({ where: wh }) }
    }
  })
  return { select } as unknown as Db
}

describe('GetTenantAdminSummaryHandler', () => {
  let handler: GetTenantAdminSummaryHandler
  let kernelQuery: Pick<KernelQueryFacade, 'getTenant'>
  let db: Db

  describe('tenant_admin access control', () => {
    it('returns summary when tenant_admin reads own tenant', async () => {
      db = makeDb([], [])
      kernelQuery = { getTenant: vi.fn().mockResolvedValue(makeTenant()) }
      handler = new GetTenantAdminSummaryHandler(db, kernelQuery as unknown as KernelQueryFacade)

      const query = new GetTenantAdminSummaryQuery(TENANT_ID, ACTOR_ID, ['tenant_admin'], TENANT_ID)
      const result = await handler.execute(query)

      expect(result.tenant.id).toBe(TENANT_ID)
      expect(result.aiConfig).toBeNull()
      expect(result.moduleToggles).toEqual([])
    })

    it('throws ForbiddenException when tenant_admin requests a different tenantId', async () => {
      db = makeDb([], [])
      kernelQuery = { getTenant: vi.fn() }
      handler = new GetTenantAdminSummaryHandler(db, kernelQuery as unknown as KernelQueryFacade)

      const query = new GetTenantAdminSummaryQuery(
        TENANT_ID,
        ACTOR_ID,
        ['tenant_admin'],
        OTHER_TENANT_ID,
      )

      await expect(handler.execute(query)).rejects.toBeInstanceOf(ForbiddenException)
      expect(kernelQuery.getTenant).not.toHaveBeenCalled()
    })
  })

  describe('platform_admin access control', () => {
    it('allows platform_admin to read any tenant', async () => {
      db = makeDb([], [])
      kernelQuery = { getTenant: vi.fn().mockResolvedValue(makeTenant(OTHER_TENANT_ID)) }
      handler = new GetTenantAdminSummaryHandler(db, kernelQuery as unknown as KernelQueryFacade)

      const query = new GetTenantAdminSummaryQuery(
        TENANT_ID,
        ACTOR_ID,
        ['platform_admin'],
        OTHER_TENANT_ID,
      )

      const result = await handler.execute(query)
      expect(result.tenant.id).toBe(OTHER_TENANT_ID)
    })
  })

  describe('AI config masking', () => {
    it('returns masked AI config metadata (no apiKeyRef in result)', async () => {
      const aiRow = makeAiRow()
      db = makeDb([aiRow], [])
      kernelQuery = { getTenant: vi.fn().mockResolvedValue(makeTenant()) }
      handler = new GetTenantAdminSummaryHandler(db, kernelQuery as unknown as KernelQueryFacade)

      const query = new GetTenantAdminSummaryQuery(TENANT_ID, ACTOR_ID, ['tenant_admin'], TENANT_ID)

      const result = await handler.execute(query)

      expect(result.aiConfig).not.toBeNull()
      expect(result.aiConfig!.apiKeyLastFour).toBe('4321')
      expect((result.aiConfig as unknown as Record<string, unknown>)['apiKeyRef']).toBeUndefined()
    })

    it('returns null aiConfig when no AI config exists', async () => {
      db = makeDb([], [])
      kernelQuery = { getTenant: vi.fn().mockResolvedValue(makeTenant()) }
      handler = new GetTenantAdminSummaryHandler(db, kernelQuery as unknown as KernelQueryFacade)

      const query = new GetTenantAdminSummaryQuery(TENANT_ID, ACTOR_ID, ['tenant_admin'], TENANT_ID)

      const result = await handler.execute(query)
      expect(result.aiConfig).toBeNull()
    })
  })

  describe('module toggles', () => {
    it('returns module toggle states', async () => {
      const toggleRows = [
        { moduleKey: 'people', enabled: true },
        { moduleKey: 'hiring', enabled: false },
      ]
      db = makeDb([], toggleRows)
      kernelQuery = { getTenant: vi.fn().mockResolvedValue(makeTenant()) }
      handler = new GetTenantAdminSummaryHandler(db, kernelQuery as unknown as KernelQueryFacade)

      const query = new GetTenantAdminSummaryQuery(TENANT_ID, ACTOR_ID, ['tenant_admin'], TENANT_ID)

      const result = await handler.execute(query)
      expect(result.moduleToggles).toEqual([
        { moduleKey: 'people', enabled: true },
        { moduleKey: 'hiring', enabled: false },
      ])
    })
  })
})
