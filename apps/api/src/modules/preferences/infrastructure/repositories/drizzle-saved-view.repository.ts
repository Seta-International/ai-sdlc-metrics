import { Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type {
  ResolveResult,
  SavedView,
  SavedViewState,
} from '../../domain/entities/saved-view.entity'
import { normalizeSavedViewState } from '../../domain/entities/saved-view.entity'
import type { ISavedViewRepository } from '../../domain/repositories/saved-view.repository'
import { savedView } from '../schema/preferences.schema'

function rowToEntity(row: typeof savedView.$inferSelect): SavedView {
  return {
    id: row.id,
    tenantId: row.tenantId,
    actorId: row.actorId,
    resourceKey: row.resourceKey,
    name: row.name,
    isDefault: row.isDefault,
    stateJson: row.stateJson as SavedViewState,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

@Injectable()
export class DrizzleSavedViewRepository implements ISavedViewRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async listByResource(
    tenantId: string,
    actorId: string,
    resourceKey: string,
  ): Promise<SavedView[]> {
    const rows = await this.db
      .select()
      .from(savedView)
      .where(
        and(
          eq(savedView.tenantId, tenantId),
          eq(savedView.actorId, actorId),
          eq(savedView.resourceKey, resourceKey),
        ),
      )
    return rows.map(rowToEntity)
  }

  async findById(id: string, tenantId: string, actorId: string): Promise<SavedView | null> {
    const rows = await this.db
      .select()
      .from(savedView)
      .where(
        and(eq(savedView.id, id), eq(savedView.tenantId, tenantId), eq(savedView.actorId, actorId)),
      )
      .limit(1)
    return rows[0] ? rowToEntity(rows[0]) : null
  }

  async resolve(
    tenantId: string,
    actorId: string,
    resourceKey: string,
    activeViewId: string | null,
  ): Promise<ResolveResult> {
    const views = await this.listByResource(tenantId, actorId, resourceKey)
    const defaultView = views.find((v) => v.isDefault) ?? null
    const defaultViewId = defaultView?.id ?? null

    let activeView: SavedView | null = null
    if (activeViewId !== null) {
      // Only accept activeViewId if it belongs to this actor
      activeView = views.find((v) => v.id === activeViewId) ?? null
    }

    // Fall back to default if activeViewId is invalid/deleted/foreign
    if (activeView === null) {
      activeView = defaultView
    }

    return { views, activeView, defaultViewId }
  }

  async create(data: Omit<SavedView, 'id' | 'createdAt' | 'updatedAt'>): Promise<SavedView> {
    const normalizedState = normalizeSavedViewState(data.stateJson)

    if (data.isDefault) {
      return this.db.transaction(async (tx) => {
        // Clear existing default for this actor+resource
        await tx
          .update(savedView)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(
            and(
              eq(savedView.tenantId, data.tenantId),
              eq(savedView.actorId, data.actorId),
              eq(savedView.resourceKey, data.resourceKey),
              eq(savedView.isDefault, true),
            ),
          )

        const rows = await tx
          .insert(savedView)
          .values({
            tenantId: data.tenantId,
            actorId: data.actorId,
            resourceKey: data.resourceKey,
            name: data.name,
            isDefault: data.isDefault,
            stateJson: normalizedState,
          })
          .returning()

        return rowToEntity(rows[0]!)
      })
    }

    const rows = await this.db
      .insert(savedView)
      .values({
        tenantId: data.tenantId,
        actorId: data.actorId,
        resourceKey: data.resourceKey,
        name: data.name,
        isDefault: data.isDefault,
        stateJson: normalizedState,
      })
      .returning()

    return rowToEntity(rows[0]!)
  }

  async update(
    id: string,
    tenantId: string,
    actorId: string,
    data: Partial<Pick<SavedView, 'name' | 'stateJson'>>,
  ): Promise<SavedView> {
    const updateData: Partial<typeof savedView.$inferInsert> = {
      updatedAt: new Date(),
    }

    if (data.name !== undefined) {
      updateData.name = data.name
    }

    if (data.stateJson !== undefined) {
      updateData.stateJson = normalizeSavedViewState(data.stateJson)
    }

    const rows = await this.db
      .update(savedView)
      .set(updateData)
      .where(
        and(eq(savedView.id, id), eq(savedView.tenantId, tenantId), eq(savedView.actorId, actorId)),
      )
      .returning()

    if (!rows[0]) {
      throw new Error(`SavedView ${id} not found or not owned by actor ${actorId}`)
    }

    return rowToEntity(rows[0])
  }

  async delete(id: string, tenantId: string, actorId: string): Promise<void> {
    await this.db
      .delete(savedView)
      .where(
        and(eq(savedView.id, id), eq(savedView.tenantId, tenantId), eq(savedView.actorId, actorId)),
      )
  }

  async setDefault(
    id: string,
    tenantId: string,
    actorId: string,
    resourceKey: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Clear existing default
      await tx
        .update(savedView)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(
          and(
            eq(savedView.tenantId, tenantId),
            eq(savedView.actorId, actorId),
            eq(savedView.resourceKey, resourceKey),
            eq(savedView.isDefault, true),
          ),
        )

      // Set new default
      await tx
        .update(savedView)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(
          and(
            eq(savedView.id, id),
            eq(savedView.tenantId, tenantId),
            eq(savedView.actorId, actorId),
          ),
        )
    })
  }
}
