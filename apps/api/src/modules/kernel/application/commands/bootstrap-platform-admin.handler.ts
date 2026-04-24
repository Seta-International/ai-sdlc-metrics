import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { createHash } from 'node:crypto'
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../domain/repositories/tenant.repository.port'
import {
  ACTOR_REPOSITORY,
  type IActorRepository,
} from '../../domain/repositories/actor.repository.port'
import {
  USER_IDENTITY_REPOSITORY,
  type IUserIdentityRepository,
  PLACEHOLDER_SSO_SUBJECT_PREFIX,
} from '../../domain/repositories/user-identity.repository.port'
import {
  ROLE_GRANT_REPOSITORY,
  type IRoleGrantRepository,
} from '../../domain/repositories/role-grant.repository.port'
import {
  ROLE_PERMISSION_REPOSITORY,
  type IRolePermissionRepository,
} from '../../domain/repositories/role-permission.repository.port'
import { DEFAULT_ROLE_PERMISSIONS } from '../../domain/constants/default-role-permissions'
import type { RoleKeyValue } from '../../domain/entities/role-grant.entity'
import { BootstrapPlatformAdminCommand } from './bootstrap-platform-admin.command'

/**
 * Stable deterministic UUID derived from a seed string.
 * Produces the same ID on every run — safe to upsert.
 */
function deterministicUuid(seed: string): string {
  const hash = createHash('sha256')
    .update('future-bootstrap-v1:' + seed)
    .digest('hex')
  const p3 = '5' + hash.slice(13, 16)
  const variant = ((parseInt(hash.charAt(16), 16) & 0x3) | 0x8).toString(16)
  const p4 = variant + hash.slice(17, 20)
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${p3}-${p4}-${hash.slice(20, 32)}`
}

const SYSTEM_TENANT_SLUG = 'future-system'
const SYSTEM_TENANT_NAME = 'Future System'
const PLATFORM_ADMIN_ROLE: RoleKeyValue = 'platform_admin'

@CommandHandler(BootstrapPlatformAdminCommand)
export class BootstrapPlatformAdminHandler implements ICommandHandler<
  BootstrapPlatformAdminCommand,
  void
> {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository,
    @Inject(ACTOR_REPOSITORY) private readonly actorRepo: IActorRepository,
    @Inject(USER_IDENTITY_REPOSITORY) private readonly identityRepo: IUserIdentityRepository,
    @Inject(ROLE_GRANT_REPOSITORY) private readonly roleGrantRepo: IRoleGrantRepository,
    @Inject(ROLE_PERMISSION_REPOSITORY)
    private readonly rolePermissionRepo: IRolePermissionRepository,
  ) {}

  async execute(command: BootstrapPlatformAdminCommand): Promise<void> {
    const { platformAdminEmail } = command

    // 1. Create or find the hidden system tenant
    const systemTenantId = deterministicUuid('system-tenant')
    const systemTenant = await this.tenantRepo.upsertSystemTenant({
      id: systemTenantId,
      slug: SYSTEM_TENANT_SLUG,
      name: SYSTEM_TENANT_NAME,
    })

    // 2. Find or create the actor+identity for the platform admin email
    const existingIdentity = await this.identityRepo.findByEmailAndTenant(
      platformAdminEmail,
      systemTenant.id,
    )

    let actorId: string

    if (existingIdentity) {
      // Actor already provisioned — reuse it
      actorId = existingIdentity.actorId
    } else {
      // Create a new person actor for this email
      const newActor = await this.actorRepo.insert({
        tenantId: systemTenant.id,
        type: 'person',
        displayName: platformAdminEmail,
        status: 'active',
      })
      actorId = newActor.id

      // Create a local placeholder identity (no password, no raw secret)
      await this.identityRepo.insert({
        tenantId: systemTenant.id,
        actorId,
        email: platformAdminEmail,
        ssoSubject: PLACEHOLDER_SSO_SUBJECT_PREFIX + actorId,
        provider: 'local',
      })
    }

    // 3. Grant platform_admin if not already granted
    const existingGrants = await this.roleGrantRepo.findByActorId(actorId, systemTenant.id)
    const hasPlatformAdmin = existingGrants.some((g) => g.roleKey === PLATFORM_ADMIN_ROLE)

    if (!hasPlatformAdmin) {
      await this.roleGrantRepo.insert({
        tenantId: systemTenant.id,
        actorId,
        roleKey: PLATFORM_ADMIN_ROLE,
        scopeType: 'global',
        scopeId: null,
        grantedBy: actorId,
        source: 'manual',
      })
    }

    // 4. Seed role permissions for platform_admin in the system tenant if missing
    const existingPermissions = await this.rolePermissionRepo.findByTenantId(systemTenant.id)
    const hasPlatformAdminPerms = existingPermissions.some((p) => p.roleKey === PLATFORM_ADMIN_ROLE)

    if (!hasPlatformAdminPerms) {
      const entries = DEFAULT_ROLE_PERMISSIONS[PLATFORM_ADMIN_ROLE] ?? []
      for (const entry of entries) {
        await this.rolePermissionRepo.insert({
          tenantId: systemTenant.id,
          roleKey: PLATFORM_ADMIN_ROLE,
          permissionKey: entry.permissionKey,
          isLocked: entry.isLocked,
        })
      }
    }
  }
}
