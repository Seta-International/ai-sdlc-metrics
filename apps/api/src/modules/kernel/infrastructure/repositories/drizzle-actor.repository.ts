import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, inArray } from 'drizzle-orm'
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

  async findManyByIds(ids: string[], tenantId: string): Promise<Actor[]> {
    if (ids.length === 0) return []
    const rows = await this.db
      .select()
      .from(actor)
      .where(and(inArray(actor.id, ids), eq(actor.tenantId, tenantId)))
    return rows as Actor[]
  }

  async insert(data: {
    id?: string
    tenantId: string
    type: Actor['type']
    displayName: string
    status?: Actor['status']
  }): Promise<Actor> {
    const rows = await this.db
      .insert(actor)
      .values({
        ...(data.id !== undefined ? { id: data.id } : {}),
        tenantId: data.tenantId,
        type: data.type,
        displayName: data.displayName,
        ...(data.status !== undefined ? { status: data.status } : {}),
      })
      .returning()
    return rows[0] as Actor
  }

  async updateStatus(id: string, tenantId: string, status: Actor['status']): Promise<void> {
    await this.db
      .update(actor)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(actor.id, id), eq(actor.tenantId, tenantId)))
  }
}
