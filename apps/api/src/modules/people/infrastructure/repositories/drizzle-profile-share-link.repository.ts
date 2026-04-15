import { Inject, Injectable } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { ProfileShareLink } from '../../domain/entities/profile-share-link.entity'
import type { IProfileShareLinkRepository } from '../../domain/repositories/profile-share-link.repository'
import { profileShareLink } from '../schema/people.schema'

@Injectable()
export class DrizzleProfileShareLinkRepository implements IProfileShareLinkRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<ProfileShareLink | null> {
    const rows = await this.db
      .select()
      .from(profileShareLink)
      .where(and(eq(profileShareLink.id, id), eq(profileShareLink.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as ProfileShareLink) ?? null
  }

  async findByToken(token: string): Promise<ProfileShareLink | null> {
    const rows = await this.db
      .select()
      .from(profileShareLink)
      .where(eq(profileShareLink.token, token))
      .limit(1)
    return (rows[0] as ProfileShareLink) ?? null
  }

  async findByEmploymentId(employmentId: string, tenantId: string): Promise<ProfileShareLink[]> {
    const rows = await this.db
      .select()
      .from(profileShareLink)
      .where(
        and(
          eq(profileShareLink.employmentId, employmentId),
          eq(profileShareLink.tenantId, tenantId),
        ),
      )
    return rows as ProfileShareLink[]
  }

  async insert(data: Omit<ProfileShareLink, 'id'>): Promise<ProfileShareLink> {
    const rows = await this.db
      .insert(profileShareLink)
      .values(data as unknown as typeof profileShareLink.$inferInsert)
      .returning()
    return rows[0] as ProfileShareLink
  }

  async incrementViewCount(id: string): Promise<void> {
    await this.db
      .update(profileShareLink)
      .set({ viewCount: sql`${profileShareLink.viewCount} + 1` } as Record<string, unknown>)
      .where(eq(profileShareLink.id, id))
  }

  async revoke(id: string, tenantId: string): Promise<void> {
    await this.db
      .update(profileShareLink)
      .set({ status: 'revoked', revokedAt: new Date() } as Record<string, unknown>)
      .where(and(eq(profileShareLink.id, id), eq(profileShareLink.tenantId, tenantId)))
  }
}
