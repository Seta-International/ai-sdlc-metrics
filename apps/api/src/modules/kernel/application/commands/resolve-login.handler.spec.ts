import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResolveLoginCommand, type ResolveLoginResult } from './resolve-login.command'
import { ResolveLoginHandler } from './resolve-login.handler'
import type { IUserIdentityRepository } from '../../domain/repositories/user-identity.repository.port'
import type { IActorRepository } from '../../domain/repositories/actor.repository.port'
import type { IRoleGrantRepository } from '../../domain/repositories/role-grant.repository.port'
import type { IAuditEventRepository } from '../../domain/repositories/audit-event.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const IDENTITY_ID = '01900000-0000-7000-8000-000000000003'

describe('ResolveLoginHandler', () => {
  let handler: ResolveLoginHandler
  let userIdentityRepo: IUserIdentityRepository
  let actorRepo: IActorRepository
  let roleGrantRepo: IRoleGrantRepository
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    userIdentityRepo = {
      findById: vi.fn(),
      findBySsoSubject: vi.fn(),
      findByEmail: vi.fn(),
      insert: vi.fn(),
      updateLastLogin: vi.fn(),
      deprovisionByActorId: vi.fn(),
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
    auditRepo = { insert: vi.fn() }

    handler = new ResolveLoginHandler(userIdentityRepo, actorRepo, roleGrantRepo, auditRepo)
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
        source: 'manual' as const,
        validFrom: new Date(),
        validUntil: null,
      },
    ])

    const command = new ResolveLoginCommand(
      'microsoft',
      'entra-oid-123',
      'alice@seta.vn',
      'Alice',
      TENANT_ID,
    )

    const result: ResolveLoginResult = await handler.execute(command)

    expect(result.actorId).toBe(ACTOR_ID)
    expect(result.tenantId).toBe(TENANT_ID)
    expect(result.roles).toEqual(['employee'])
    expect(result.provider).toBe('microsoft')
    expect(userIdentityRepo.updateLastLogin).toHaveBeenCalledWith(IDENTITY_ID)
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

    const command = new ResolveLoginCommand(
      'microsoft',
      'entra-oid-456',
      'bob@seta.vn',
      'Bob',
      TENANT_ID,
    )

    const result = await handler.execute(command)

    expect(actorRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      type: 'person',
      displayName: 'Bob',
      status: 'active',
    })
    expect(userIdentityRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      email: 'bob@seta.vn',
      ssoSubject: 'entra-oid-456',
      provider: 'microsoft',
      status: 'active',
    })
    expect(result.actorId).toBe(ACTOR_ID)
    expect(result.roles).toEqual([])
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

    const command = new ResolveLoginCommand(
      'microsoft',
      'entra-oid-789',
      'charlie@seta.vn',
      'Charlie',
      TENANT_ID,
    )

    await expect(handler.execute(command)).rejects.toThrow('Account is suspended')
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

    const command = new ResolveLoginCommand(
      'microsoft',
      'entra-oid-999',
      'dana@seta.vn',
      'Dana',
      TENANT_ID,
    )

    await expect(handler.execute(command)).rejects.toThrow('Account is suspended')
  })
})
