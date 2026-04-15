import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import type { PersonProfile } from '../../domain/entities/person-profile.entity'
import type { IPersonProfileRepository } from '../../domain/repositories/person-profile.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { personProfile } from '../schema/people.schema'

@Injectable()
export class DrizzlePersonProfileRepository implements IPersonProfileRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<PersonProfile | null> {
    const rows = await this.db
      .select()
      .from(personProfile)
      .where(and(eq(personProfile.id, id), eq(personProfile.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as PersonProfile | undefined) ?? null
  }

  async findByActorId(actorId: string, tenantId: string): Promise<PersonProfile | null> {
    const rows = await this.db
      .select()
      .from(personProfile)
      .where(and(eq(personProfile.actorId, actorId), eq(personProfile.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as PersonProfile | undefined) ?? null
  }

  async insert(
    data: Omit<PersonProfile, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<PersonProfile> {
    const rows = await this.db
      .insert(personProfile)
      .values(data as Record<string, unknown>)
      .returning()
    return rows[0] as PersonProfile
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Omit<PersonProfile, 'id' | 'tenantId' | 'actorId' | 'createdAt'>>,
  ): Promise<PersonProfile> {
    const rows = await this.db
      .update(personProfile)
      .set({ ...data, updatedAt: new Date() } as Record<string, unknown>)
      .where(and(eq(personProfile.id, id), eq(personProfile.tenantId, tenantId)))
      .returning()
    return rows[0] as PersonProfile
  }
}
