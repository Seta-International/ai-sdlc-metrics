import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { StartOAuthCommand } from './start-oauth.command'
import { StartOAuthHandler } from './start-oauth.handler'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository'
import type { IOAuthAuthorizationSessionRepository } from '../../domain/repositories/oauth-authorization-session.repository'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import type { OAuthAuthorizationSessionEntity } from '../../domain/entities/oauth-authorization-session.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000010'

const activeTenant = {
  id: TENANT_ID,
  name: 'SETA International',
  slug: 'seta',
  status: 'active' as const,
  planTier: 'enterprise' as const,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

const suspendedTenant = { ...activeTenant, status: 'suspended' as const }

const microsoftProvider: IdentityProviderEntity = {
  id: PROVIDER_ID,
  tenantId: TENANT_ID,
  providerType: 'microsoft',
  displayName: 'SETA Entra',
  clientId: 'client-id-123',
  clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123:secret:entra',
  directoryId: 'aad-directory-id-456',
  isPrimary: true,
  syncEnabled: true,
  lastSyncAt: null,
  syncStatus: 'idle',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const fakeSession: OAuthAuthorizationSessionEntity = {
  id: 'session-id-1',
  tenantId: TENANT_ID,
  providerId: PROVIDER_ID,
  providerType: 'microsoft',
  stateHash: 'hash-of-state',
  nonceHash: 'hash-of-nonce',
  callbackUri: 'http://localhost:3000/auth/callback/microsoft',
  redirectTo: 'http://localhost:3001',
  expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  consumedAt: null,
  createdAt: new Date(),
  isExpired: vi.fn().mockReturnValue(false),
  isConsumed: vi.fn().mockReturnValue(false),
  isUsable: vi.fn().mockReturnValue(true),
}

describe('StartOAuthHandler', () => {
  let handler: StartOAuthHandler
  let kernelFacade: Pick<KernelQueryFacade, 'getTenant'>
  let providerRepo: IIdentityProviderRepository
  let sessionRepo: IOAuthAuthorizationSessionRepository

  beforeEach(() => {
    kernelFacade = { getTenant: vi.fn() }
    providerRepo = {
      findById: vi.fn(),
      findByTenantId: vi.fn(),
      findPrimary: vi.fn(),
      findPrimaryByTenantId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    sessionRepo = {
      insert: vi.fn(),
      findByStateHash: vi.fn(),
      findByTenantId: vi.fn(),
      consume: vi.fn(),
    }
    handler = new StartOAuthHandler(
      kernelFacade as unknown as KernelQueryFacade,
      providerRepo,
      sessionRepo,
    )
  })

  describe('happy path — Microsoft', () => {
    it('returns a Microsoft authorization URL for an active tenant with a ready provider', async () => {
      vi.mocked(kernelFacade.getTenant).mockResolvedValue(activeTenant)
      vi.mocked(providerRepo.findById).mockResolvedValue(microsoftProvider)
      vi.mocked(sessionRepo.insert).mockResolvedValue(fakeSession)

      const result = await handler.execute(
        new StartOAuthCommand(
          TENANT_ID,
          PROVIDER_ID,
          'http://localhost:3000/auth/callback/microsoft',
          'http://localhost:3001',
        ),
      )

      expect(result.authorizationUrl).toContain('https://login.microsoftonline.com')
      expect(result.authorizationUrl).toContain('aad-directory-id-456')
      expect(result.authorizationUrl).toContain('oauth2/v2.0/authorize')
      expect(result.authorizationUrl).toContain('client_id=client-id-123')
      expect(result.authorizationUrl).toContain('response_type=code')
      expect(result.authorizationUrl).toContain('openid')
    })

    it('stores only the hashed state and nonce, not the raw values', async () => {
      vi.mocked(kernelFacade.getTenant).mockResolvedValue(activeTenant)
      vi.mocked(providerRepo.findById).mockResolvedValue(microsoftProvider)
      vi.mocked(sessionRepo.insert).mockResolvedValue(fakeSession)

      await handler.execute(
        new StartOAuthCommand(
          TENANT_ID,
          PROVIDER_ID,
          'http://localhost:3000/auth/callback/microsoft',
          'http://localhost:3001',
        ),
      )

      const insertCall = vi.mocked(sessionRepo.insert).mock.calls[0][0]
      // stateHash must be a 64-char hex SHA-256 — not a raw random string
      expect(insertCall.stateHash).toMatch(/^[0-9a-f]{64}$/)
      expect(insertCall.nonceHash).toMatch(/^[0-9a-f]{64}$/)
      // The opaque state passed to the URL should differ from the stored hash
      const url = new URL(
        (
          await handler.execute(
            new StartOAuthCommand(
              TENANT_ID,
              PROVIDER_ID,
              'http://localhost:3000/auth/callback/microsoft',
              'http://localhost:3001',
            ),
          )
        ).authorizationUrl,
      )
      const opaqueState = url.searchParams.get('state')!
      const hashOfOpaqueState = createHash('sha256').update(opaqueState).digest('hex')
      // The hash stored in the second call must equal sha256(opaqueState)
      const secondInsertCall = vi.mocked(sessionRepo.insert).mock.calls[1][0]
      expect(secondInsertCall.stateHash).toBe(hashOfOpaqueState)
    })

    it('sets redirectTo on the session from the command', async () => {
      vi.mocked(kernelFacade.getTenant).mockResolvedValue(activeTenant)
      vi.mocked(providerRepo.findById).mockResolvedValue(microsoftProvider)
      vi.mocked(sessionRepo.insert).mockResolvedValue(fakeSession)

      await handler.execute(
        new StartOAuthCommand(
          TENANT_ID,
          PROVIDER_ID,
          'http://localhost:3000/auth/callback/microsoft',
          'http://localhost:3001',
        ),
      )

      const insertCall = vi.mocked(sessionRepo.insert).mock.calls[0][0]
      expect(insertCall.redirectTo).toBe('http://localhost:3001')
    })
  })

  describe('error paths', () => {
    it('throws TenantSuspendedException for a suspended tenant', async () => {
      vi.mocked(kernelFacade.getTenant).mockResolvedValue(suspendedTenant)

      await expect(
        handler.execute(
          new StartOAuthCommand(
            TENANT_ID,
            PROVIDER_ID,
            'http://localhost:3000/auth/callback/microsoft',
            'http://localhost:3001',
          ),
        ),
      ).rejects.toThrow('suspended')
    })

    it('throws when tenant is not found', async () => {
      vi.mocked(kernelFacade.getTenant).mockResolvedValue(null)

      await expect(
        handler.execute(
          new StartOAuthCommand(
            TENANT_ID,
            PROVIDER_ID,
            'http://localhost:3000/auth/callback/microsoft',
            'http://localhost:3001',
          ),
        ),
      ).rejects.toThrow()
    })

    it('throws when provider is not found', async () => {
      vi.mocked(kernelFacade.getTenant).mockResolvedValue(activeTenant)
      vi.mocked(providerRepo.findById).mockResolvedValue(null)

      await expect(
        handler.execute(
          new StartOAuthCommand(
            TENANT_ID,
            PROVIDER_ID,
            'http://localhost:3000/auth/callback/microsoft',
            'http://localhost:3001',
          ),
        ),
      ).rejects.toThrow()
    })

    it('throws for a redirectTo URL that is not an allowed Future zone', async () => {
      vi.mocked(kernelFacade.getTenant).mockResolvedValue(activeTenant)
      vi.mocked(providerRepo.findById).mockResolvedValue(microsoftProvider)

      await expect(
        handler.execute(
          new StartOAuthCommand(
            TENANT_ID,
            PROVIDER_ID,
            'http://localhost:3000/auth/callback/microsoft',
            'https://evil.example.com',
          ),
        ),
      ).rejects.toThrow('redirectTo')
    })

    it('accepts production Future zone URLs as valid redirectTo', async () => {
      vi.mocked(kernelFacade.getTenant).mockResolvedValue(activeTenant)
      vi.mocked(providerRepo.findById).mockResolvedValue(microsoftProvider)
      vi.mocked(sessionRepo.insert).mockResolvedValue(fakeSession)

      await expect(
        handler.execute(
          new StartOAuthCommand(
            TENANT_ID,
            PROVIDER_ID,
            'http://localhost:3000/auth/callback/microsoft',
            'https://people.future.seta-international.vn',
          ),
        ),
      ).resolves.toBeDefined()
    })
  })
})
