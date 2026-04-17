import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResolveLoginCommand, type ResolveLoginResult } from './resolve-login.command'
import { ResolveLoginHandler } from './resolve-login.handler'
import type { IUserIdentityRepository } from '../../domain/repositories/user-identity.repository.port'
import type { IActorRepository } from '../../domain/repositories/actor.repository.port'
import type { IRoleGrantRepository } from '../../domain/repositories/role-grant.repository.port'
import type { IAuditEventRepository } from '../../domain/repositories/audit-event.repository.port'
import type { ITenantRepository } from '../../domain/repositories/tenant.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const IDENTITY_ID = '01900000-0000-7000-8000-000000000003'
const TENANT_NAME = 'Acme Corp'

describe('ResolveLoginHandler', () => {
  let handler: ResolveLoginHandler
  let userIdentityRepo: IUserIdentityRepository
  let actorRepo: IActorRepository
  let roleGrantRepo: IRoleGrantRepository
  let auditRepo: IAuditEventRepository
  let tenantRepo: ITenantRepository

  beforeEach(() => {
    userIdentityRepo = {
      findById: vi.fn(),
      findBySsoSubject: vi.fn(),
      findByEmail: vi.fn(),
      findByEmailAndTenant: vi.fn(),
      insert: vi.fn(),
      claimSsoSubject: vi.fn(),
      deprovisionByActorId: vi.fn(),
      updateLastLogin: vi.fn(),
    }
    actorRepo = {
      findById: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
    }
    roleGrantRepo = {
      findByActorId: vi.fn(),
      insert: vi.fn(),
      revokeAllForActor: vi.fn(),
      revokeBySource: vi.fn(),
    }
    auditRepo = { insert: vi.fn(), query: vi.fn(), queryAll: vi.fn() }
    tenantRepo = {
      findById: vi.fn().mockResolvedValue({
        id: TENANT_ID,
        name: TENANT_NAME,
        slug: 'acme',
        status: 'active',
        planTier: 'professional',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      findBySlug: vi.fn(),
      insert: vi.fn(),
    }
    handler = new ResolveLoginHandler(
      userIdentityRepo,
      actorRepo,
      roleGrantRepo,
      auditRepo,
      tenantRepo,
    )
  })

  it('returns session data for existing active user', async () => {
    vi.mocked(userIdentityRepo.findBySsoSubject).mockResolvedValue({
      id: IDENTITY_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      email: 'alice@seta.vn',
      ssoSubject: 'entra-oid-123',
      provider: 'microsoft',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date(),
    })
    vi.mocked(actorRepo.findById).mockResolvedValue({
      id: ACTOR_ID,
      tenantId: TENANT_ID,
      type: 'person',
      displayName: 'Alice',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([
      {
        id: '01900000-0000-7000-8000-000000000010',
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        roleKey: 'employee',
        scopeType: 'global',
        scopeId: null,
        grantedBy: ACTOR_ID,
        validFrom: new Date(),
        validUntil: null,
        source: 'manual',
      },
    ])

    const result: ResolveLoginResult = await handler.execute(
      new ResolveLoginCommand('microsoft', 'entra-oid-123', 'alice@seta.vn', 'Alice', TENANT_ID),
    )

    expect(result.actorId).toBe(ACTOR_ID)
    expect(result.tenantId).toBe(TENANT_ID)
    expect(result.tenantName).toBe(TENANT_NAME)
    expect(result.displayName).toBe('Alice')
    expect(result.email).toBe('alice@seta.vn')
    expect(result.roles).toEqual(['employee'])
    expect(result.provider).toBe('microsoft')
    expect(userIdentityRepo.updateLastLogin).toHaveBeenCalledWith(IDENTITY_ID)
    expect(tenantRepo.findById).toHaveBeenCalledWith(TENANT_ID)
    expect(auditRepo.insert).toHaveBeenCalled()
  })

  it('JIT creates actor + user_identity for new SSO user', async () => {
    vi.mocked(userIdentityRepo.findBySsoSubject).mockResolvedValue(null)
    vi.mocked(actorRepo.insert).mockResolvedValue({
      id: ACTOR_ID,
      tenantId: TENANT_ID,
      type: 'person',
      displayName: 'Bob',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(userIdentityRepo.insert).mockResolvedValue({
      id: IDENTITY_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      email: 'bob@seta.vn',
      ssoSubject: 'entra-oid-456',
      provider: 'microsoft',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date(),
    })
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([])

    const result = await handler.execute(
      new ResolveLoginCommand('microsoft', 'entra-oid-456', 'bob@seta.vn', 'Bob', TENANT_ID),
    )

    expect(actorRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        type: 'person',
        displayName: 'Bob',
      }),
    )
    expect(userIdentityRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        email: 'bob@seta.vn',
        ssoSubject: 'entra-oid-456',
      }),
    )
    expect(result.actorId).toBe(ACTOR_ID)
    expect(result.tenantName).toBe(TENANT_NAME)
    expect(result.displayName).toBe('Bob')
    expect(result.email).toBe('bob@seta.vn')
    expect(result.roles).toEqual([])
  })

  it('claims a pre-provisioned identity by email on first SSO login', async () => {
    const PLACEHOLDER_SSO = 'pending-sso-' + ACTOR_ID
    vi.mocked(userIdentityRepo.findBySsoSubject).mockResolvedValue(null)
    vi.mocked(userIdentityRepo.findByEmailAndTenant).mockResolvedValue({
      id: IDENTITY_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      email: 'canh.ta@seta-international.vn',
      ssoSubject: PLACEHOLDER_SSO,
      provider: 'microsoft',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date(),
    })
    vi.mocked(actorRepo.findById).mockResolvedValue({
      id: ACTOR_ID,
      tenantId: TENANT_ID,
      type: 'person',
      displayName: 'Canh Ta',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([
      {
        id: '01900000-0000-7000-8000-000000000010',
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        roleKey: 'tenant_admin',
        scopeType: 'global',
        scopeId: null,
        grantedBy: ACTOR_ID,
        validFrom: new Date(),
        validUntil: null,
        source: 'manual',
      },
    ])

    const REAL_OID = '6f616bed-4388-4262-88c4-6fec04c524e7'
    const result = await handler.execute(
      new ResolveLoginCommand(
        'microsoft',
        REAL_OID,
        'canh.ta@seta-international.vn',
        'Canh Ta',
        TENANT_ID,
      ),
    )

    expect(userIdentityRepo.claimSsoSubject).toHaveBeenCalledWith(
      IDENTITY_ID,
      TENANT_ID,
      REAL_OID,
      'microsoft',
    )
    expect(actorRepo.insert).not.toHaveBeenCalled()
    expect(userIdentityRepo.insert).not.toHaveBeenCalled()
    expect(userIdentityRepo.updateLastLogin).toHaveBeenCalledWith(IDENTITY_ID)
    expect(result.actorId).toBe(ACTOR_ID)
    expect(result.roles).toEqual(['tenant_admin'])
  })

  it('falls through to JIT when email match has a real (non-placeholder) sso_subject', async () => {
    vi.mocked(userIdentityRepo.findBySsoSubject).mockResolvedValue(null)
    vi.mocked(userIdentityRepo.findByEmailAndTenant).mockResolvedValue({
      id: IDENTITY_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      email: 'eve@seta.vn',
      ssoSubject: 'real-oid-already-claimed',
      provider: 'microsoft',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date(),
    })
    vi.mocked(actorRepo.insert).mockResolvedValue({
      id: '01900000-0000-7000-8000-0000000000aa',
      tenantId: TENANT_ID,
      type: 'person',
      displayName: 'Eve',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(userIdentityRepo.insert).mockResolvedValue({
      id: '01900000-0000-7000-8000-0000000000bb',
      tenantId: TENANT_ID,
      actorId: '01900000-0000-7000-8000-0000000000aa',
      email: 'eve@seta.vn',
      ssoSubject: 'different-oid',
      provider: 'microsoft',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date(),
    })
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([])

    await handler.execute(
      new ResolveLoginCommand('microsoft', 'different-oid', 'eve@seta.vn', 'Eve', TENANT_ID),
    )

    expect(userIdentityRepo.claimSsoSubject).not.toHaveBeenCalled()
    expect(actorRepo.insert).toHaveBeenCalled()
    expect(userIdentityRepo.insert).toHaveBeenCalled()
  })

  it('throws when tenant lookup returns null', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(null)
    await expect(
      handler.execute(
        new ResolveLoginCommand('microsoft', 'entra-oid-123', 'alice@seta.vn', 'Alice', TENANT_ID),
      ),
    ).rejects.toThrow(/tenant/i)
  })

  it('throws for suspended user identity', async () => {
    vi.mocked(userIdentityRepo.findBySsoSubject).mockResolvedValue({
      id: IDENTITY_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      email: 'charlie@seta.vn',
      ssoSubject: 'entra-oid-789',
      provider: 'microsoft',
      status: 'suspended',
      lastLoginAt: null,
      createdAt: new Date(),
    })
    await expect(
      handler.execute(
        new ResolveLoginCommand(
          'microsoft',
          'entra-oid-789',
          'charlie@seta.vn',
          'Charlie',
          TENANT_ID,
        ),
      ),
    ).rejects.toThrow('Account is suspended')
  })

  it('throws for suspended actor', async () => {
    vi.mocked(userIdentityRepo.findBySsoSubject).mockResolvedValue({
      id: IDENTITY_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      email: 'dana@seta.vn',
      ssoSubject: 'entra-oid-999',
      provider: 'microsoft',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date(),
    })
    vi.mocked(actorRepo.findById).mockResolvedValue({
      id: ACTOR_ID,
      tenantId: TENANT_ID,
      type: 'person',
      displayName: 'Dana',
      status: 'suspended',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await expect(
      handler.execute(
        new ResolveLoginCommand('microsoft', 'entra-oid-999', 'dana@seta.vn', 'Dana', TENANT_ID),
      ),
    ).rejects.toThrow('Account is suspended')
  })
})
