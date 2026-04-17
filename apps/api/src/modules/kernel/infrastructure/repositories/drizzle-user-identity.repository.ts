import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, sql } from 'drizzle-orm'
import type { UserIdentity } from '../../domain/entities/user-identity.entity'
import type { IUserIdentityRepository } from '../../domain/repositories/user-identity.repository.port'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { userIdentity } from '../schema/index'

@Injectable()
export class DrizzleUserIdentityRepository implements IUserIdentityRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<UserIdentity | null> {
    const rows = await this.db
      .select()
      .from(userIdentity)
      .where(and(eq(userIdentity.id, id), eq(userIdentity.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as UserIdentity | undefined) ?? null
  }

  async findBySsoSubject(ssoSubject: string, tenantId: string): Promise<UserIdentity | null> {
    const rows = await this.db
      .select()
      .from(userIdentity)
      .where(and(eq(userIdentity.ssoSubject, ssoSubject), eq(userIdentity.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as UserIdentity | undefined) ?? null
  }

  async findByEmailAndTenant(email: string, tenantId: string): Promise<UserIdentity | null> {
    const rows = await this.db
      .select()
      .from(userIdentity)
      .where(and(eq(userIdentity.email, email), eq(userIdentity.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as UserIdentity | undefined) ?? null
  }

  async claimSsoSubject(
    id: string,
    tenantId: string,
    ssoSubject: string,
    provider: UserIdentity['provider'],
  ): Promise<void> {
    await this.db
      .update(userIdentity)
      .set({ ssoSubject, provider })
      .where(and(eq(userIdentity.id, id), eq(userIdentity.tenantId, tenantId)))
  }

  async insert(data: {
    tenantId: string
    actorId: string
    email: string
    ssoSubject: string
    provider: UserIdentity['provider']
  }): Promise<UserIdentity> {
    const rows = await this.db
      .insert(userIdentity)
      .values({
        tenantId: data.tenantId,
        actorId: data.actorId,
        email: data.email,
        ssoSubject: data.ssoSubject,
        provider: data.provider,
      })
      .returning()
    return rows[0] as UserIdentity
  }

  async deprovisionByActorId(actorId: string, tenantId: string): Promise<void> {
    await this.db
      .update(userIdentity)
      .set({ status: 'deprovisioned' })
      .where(and(eq(userIdentity.actorId, actorId), eq(userIdentity.tenantId, tenantId)))
  }

  async findByEmail(email: string): Promise<UserIdentity | null> {
    const rows = await this.db
      .select()
      .from(userIdentity)
      .where(and(eq(userIdentity.email, email), eq(userIdentity.status, 'active')))
      .limit(1)
    return (rows[0] as UserIdentity | undefined) ?? null
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.db
      .update(userIdentity)
      .set({ lastLoginAt: sql`NOW()` })
      .where(eq(userIdentity.id, id))
  }
}
