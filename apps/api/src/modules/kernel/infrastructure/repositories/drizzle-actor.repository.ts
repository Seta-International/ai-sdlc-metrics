import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import type { Actor } from '../../domain/entities/actor.entity'
import type { IActorRepository } from '../../domain/repositories/actor.repository.port'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { actor } from '../schema/index'

@Injectable()
export class DrizzleActorRepository implements IActorRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<Actor | null> {
    const rows = await this.db
      .select()
      .from(actor)
      .where(and(eq(actor.id, id), eq(actor.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as Actor | undefined) ?? null
  }

  async insert(data: {
    tenantId: string
    type: Actor['type']
    displayName: string
  }): Promise<Actor> {
    const rows = await this.db
      .insert(actor)
      .values({
        tenantId: data.tenantId,
        type: data.type,
        displayName: data.displayName,
      })
      .returning()
    return rows[0] as Actor
  }
}
