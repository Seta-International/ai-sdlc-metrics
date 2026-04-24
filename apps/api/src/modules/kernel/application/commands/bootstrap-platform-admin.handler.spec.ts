import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BootstrapPlatformAdminCommand } from './bootstrap-platform-admin.command'
import { BootstrapPlatformAdminHandler } from './bootstrap-platform-admin.handler'
import type { Tenant } from '../../domain/entities/tenant.entity'
import type { Actor } from '../../domain/entities/actor.entity'
import type { UserIdentity } from '../../domain/entities/user-identity.entity'
import type { RoleGrant } from '../../domain/entities/role-grant.entity'
import type { ITenantRepository } from '../../domain/repositories/tenant.repository.port'
import type { IActorRepository } from '../../domain/repositories/actor.repository.port'
import type { IUserIdentityRepository } from '../../domain/repositories/user-identity.repository.port'
import type { IRoleGrantRepository } from '../../domain/repositories/role-grant.repository.port'
import type { IRolePermissionRepository } from '../../domain/repositories/role-permission.repository.port'

const SYSTEM_TENANT_ID = '01900000-0000-7000-8000-aaaaaaaaaaaa'
const ACTOR_ID = '01900000-0000-7000-8000-bbbbbbbbbbbb'
const IDENTITY_ID = '01900000-0000-7000-8000-cccccccccccc'
const GRANT_ID = '01900000-0000-7000-8000-dddddddddddd'
const PLATFORM_ADMIN_EMAIL = 'admin@example.com'

const fakeSystemTenant: Tenant = {
  id: SYSTEM_TENANT_ID,
  name: 'Future System',
  slug: 'future-system',
  status: 'active',
  planTier: 'enterprise',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const fakeActor: Actor = {
  id: ACTOR_ID,
  tenantId: SYSTEM_TENANT_ID,
  type: 'person',
  displayName: PLATFORM_ADMIN_EMAIL,
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const fakeIdentity: UserIdentity = {
  id: IDENTITY_ID,
  tenantId: SYSTEM_TENANT_ID,
  actorId: ACTOR_ID,
  email: PLATFORM_ADMIN_EMAIL,
  ssoSubject: 'pending-sso-' + ACTOR_ID,
  provider: 'local',
  status: 'active',
  lastLoginAt: null,
  createdAt: new Date(),
}

const fakeGrant: RoleGrant = {
  id: GRANT_ID,
  tenantId: SYSTEM_TENANT_ID,
  actorId: ACTOR_ID,
  roleKey: 'platform_admin',
  scopeType: 'global',
  scopeId: null,
  grantedBy: ACTOR_ID,
  source: 'manual',
  validFrom: new Date(),
  validUntil: null,
}

describe('BootstrapPlatformAdminHandler', () => {
  let handler: BootstrapPlatformAdminHandler
  let tenantRepo: ITenantRepository
  let actorRepo: IActorRepository
  let identityRepo: IUserIdentityRepository
  let roleGrantRepo: IRoleGrantRepository
  let rolePermissionRepo: IRolePermissionRepository

  beforeEach(() => {
    tenantRepo = {
      findById: vi.fn(),
      findBySlug: vi.fn(),
      findAll: vi.fn(),
      insert: vi.fn(),
      upsertSystemTenant: vi.fn(),
    } as unknown as ITenantRepository

    actorRepo = {
      findById: vi.fn(),
      findManyByIds: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      findByEmailAndTenantId: vi.fn(),
    } as unknown as IActorRepository

    identityRepo = {
      findById: vi.fn(),
      findByActorId: vi.fn(),
      findBySsoSubject: vi.fn(),
      findByEmailAndTenant: vi.fn(),
      findByEmail: vi.fn(),
      insert: vi.fn(),
      claimSsoSubject: vi.fn(),
      deprovisionByActorId: vi.fn(),
      updateLastLogin: vi.fn(),
    } as unknown as IUserIdentityRepository

    roleGrantRepo = {
      findByActorId: vi.fn(),
      insert: vi.fn(),
      revokeAllForActor: vi.fn(),
      revokeBySource: vi.fn(),
    } as unknown as IRoleGrantRepository

    rolePermissionRepo = {
      findByRoleKey: vi.fn(),
      findByRoleKeys: vi.fn(),
      findByTenantId: vi.fn(),
      findByRoleKeyAndPermissionKey: vi.fn(),
      insert: vi.fn(),
      remove: vi.fn(),
      removeAllForRole: vi.fn(),
      insertMany: vi.fn(),
      findAll: vi.fn(),
    } as unknown as IRolePermissionRepository

    handler = new BootstrapPlatformAdminHandler(
      tenantRepo,
      actorRepo,
      identityRepo,
      roleGrantRepo,
      rolePermissionRepo,
    )
  })

  it('creates the system tenant if it does not exist', async () => {
    vi.mocked(tenantRepo.upsertSystemTenant).mockResolvedValue(fakeSystemTenant)
    vi.mocked(identityRepo.findByEmailAndTenant).mockResolvedValue(null)
    vi.mocked(actorRepo.insert).mockResolvedValue(fakeActor)
    vi.mocked(identityRepo.insert).mockResolvedValue(fakeIdentity)
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([])
    vi.mocked(roleGrantRepo.insert).mockResolvedValue(fakeGrant)
    vi.mocked(rolePermissionRepo.findByTenantId).mockResolvedValue([])
    vi.mocked(rolePermissionRepo.insert).mockResolvedValue({
      id: 'perm-1',
      tenantId: SYSTEM_TENANT_ID,
      roleKey: 'platform_admin',
      permissionKey: 'admin:role:manage',
      isLocked: true,
      createdAt: new Date(),
    })

    await handler.execute(new BootstrapPlatformAdminCommand(PLATFORM_ADMIN_EMAIL))

    expect(tenantRepo.upsertSystemTenant).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'future-system' }),
    )
  })

  it('creates a person actor for the platform admin email', async () => {
    vi.mocked(tenantRepo.upsertSystemTenant).mockResolvedValue(fakeSystemTenant)
    vi.mocked(identityRepo.findByEmailAndTenant).mockResolvedValue(null)
    vi.mocked(actorRepo.insert).mockResolvedValue(fakeActor)
    vi.mocked(identityRepo.insert).mockResolvedValue(fakeIdentity)
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([])
    vi.mocked(roleGrantRepo.insert).mockResolvedValue(fakeGrant)
    vi.mocked(rolePermissionRepo.findByTenantId).mockResolvedValue([])
    vi.mocked(rolePermissionRepo.insert).mockResolvedValue({
      id: 'perm-1',
      tenantId: SYSTEM_TENANT_ID,
      roleKey: 'platform_admin',
      permissionKey: 'admin:role:manage',
      isLocked: true,
      createdAt: new Date(),
    })

    await handler.execute(new BootstrapPlatformAdminCommand(PLATFORM_ADMIN_EMAIL))

    expect(actorRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: SYSTEM_TENANT_ID,
        type: 'person',
      }),
    )
  })

  it('creates a local placeholder identity for the actor', async () => {
    vi.mocked(tenantRepo.upsertSystemTenant).mockResolvedValue(fakeSystemTenant)
    vi.mocked(identityRepo.findByEmailAndTenant).mockResolvedValue(null)
    vi.mocked(actorRepo.insert).mockResolvedValue(fakeActor)
    vi.mocked(identityRepo.insert).mockResolvedValue(fakeIdentity)
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([])
    vi.mocked(roleGrantRepo.insert).mockResolvedValue(fakeGrant)
    vi.mocked(rolePermissionRepo.findByTenantId).mockResolvedValue([])
    vi.mocked(rolePermissionRepo.insert).mockResolvedValue({
      id: 'perm-1',
      tenantId: SYSTEM_TENANT_ID,
      roleKey: 'platform_admin',
      permissionKey: 'admin:role:manage',
      isLocked: true,
      createdAt: new Date(),
    })

    await handler.execute(new BootstrapPlatformAdminCommand(PLATFORM_ADMIN_EMAIL))

    expect(identityRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: SYSTEM_TENANT_ID,
        email: PLATFORM_ADMIN_EMAIL,
        provider: 'local',
      }),
    )

    const insertCall = vi.mocked(identityRepo.insert).mock.calls[0]![0]
    expect(insertCall.ssoSubject).toMatch(/^pending-sso-/)
    // Must not store a raw password or secret
    expect(insertCall).not.toHaveProperty('password')
    expect(insertCall).not.toHaveProperty('secret')
  })

  it('grants platform_admin role in the system tenant', async () => {
    vi.mocked(tenantRepo.upsertSystemTenant).mockResolvedValue(fakeSystemTenant)
    vi.mocked(identityRepo.findByEmailAndTenant).mockResolvedValue(null)
    vi.mocked(actorRepo.insert).mockResolvedValue(fakeActor)
    vi.mocked(identityRepo.insert).mockResolvedValue(fakeIdentity)
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([])
    vi.mocked(roleGrantRepo.insert).mockResolvedValue(fakeGrant)
    vi.mocked(rolePermissionRepo.findByTenantId).mockResolvedValue([])
    vi.mocked(rolePermissionRepo.insert).mockResolvedValue({
      id: 'perm-1',
      tenantId: SYSTEM_TENANT_ID,
      roleKey: 'platform_admin',
      permissionKey: 'admin:role:manage',
      isLocked: true,
      createdAt: new Date(),
    })

    await handler.execute(new BootstrapPlatformAdminCommand(PLATFORM_ADMIN_EMAIL))

    expect(roleGrantRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: SYSTEM_TENANT_ID,
        actorId: ACTOR_ID,
        roleKey: 'platform_admin',
        scopeType: 'global',
      }),
    )
  })

  it('is idempotent: skips actor and identity creation when identity already exists', async () => {
    vi.mocked(tenantRepo.upsertSystemTenant).mockResolvedValue(fakeSystemTenant)
    // Identity already exists for this email/tenant
    vi.mocked(identityRepo.findByEmailAndTenant).mockResolvedValue(fakeIdentity)
    // Actor already exists
    vi.mocked(actorRepo.findById).mockResolvedValue(fakeActor)
    // Role grant already exists
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([fakeGrant])
    vi.mocked(rolePermissionRepo.findByTenantId).mockResolvedValue([])
    vi.mocked(rolePermissionRepo.insert).mockResolvedValue({
      id: 'perm-1',
      tenantId: SYSTEM_TENANT_ID,
      roleKey: 'platform_admin',
      permissionKey: 'admin:role:manage',
      isLocked: true,
      createdAt: new Date(),
    })

    await handler.execute(new BootstrapPlatformAdminCommand(PLATFORM_ADMIN_EMAIL))

    expect(actorRepo.insert).not.toHaveBeenCalled()
    expect(identityRepo.insert).not.toHaveBeenCalled()
    expect(roleGrantRepo.insert).not.toHaveBeenCalled()
  })

  it('does not set passwords or raw secrets on the identity', async () => {
    vi.mocked(tenantRepo.upsertSystemTenant).mockResolvedValue(fakeSystemTenant)
    vi.mocked(identityRepo.findByEmailAndTenant).mockResolvedValue(null)
    vi.mocked(actorRepo.insert).mockResolvedValue(fakeActor)
    vi.mocked(identityRepo.insert).mockResolvedValue(fakeIdentity)
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([])
    vi.mocked(roleGrantRepo.insert).mockResolvedValue(fakeGrant)
    vi.mocked(rolePermissionRepo.findByTenantId).mockResolvedValue([])
    vi.mocked(rolePermissionRepo.insert).mockResolvedValue({
      id: 'perm-1',
      tenantId: SYSTEM_TENANT_ID,
      roleKey: 'platform_admin',
      permissionKey: 'admin:role:manage',
      isLocked: true,
      createdAt: new Date(),
    })

    await handler.execute(new BootstrapPlatformAdminCommand(PLATFORM_ADMIN_EMAIL))

    const insertCall = vi.mocked(identityRepo.insert).mock.calls[0]![0]
    const insertedKeys = Object.keys(insertCall)
    expect(insertedKeys).not.toContain('password')
    expect(insertedKeys).not.toContain('passwordHash')
    expect(insertedKeys).not.toContain('clientSecret')
    expect(insertedKeys).not.toContain('secret')
  })
})
