import { Inject, Injectable } from '@nestjs/common'
import type { ResolveResult, SavedView } from '../../domain/entities/saved-view.entity'
import {
  SAVED_VIEW_REPOSITORY,
  type ISavedViewRepository,
} from '../../domain/repositories/saved-view.repository'

@Injectable()
export class PreferencesQueryFacade {
  constructor(
    @Inject(SAVED_VIEW_REPOSITORY)
    private readonly savedViewRepo: ISavedViewRepository,
  ) {}

  async resolve(
    tenantId: string,
    actorId: string,
    resourceKey: string,
    activeViewId: string | null,
  ): Promise<ResolveResult> {
    return this.savedViewRepo.resolve(tenantId, actorId, resourceKey, activeViewId)
  }

  async list(tenantId: string, actorId: string, resourceKey: string): Promise<SavedView[]> {
    return this.savedViewRepo.listByResource(tenantId, actorId, resourceKey)
  }

  async create(input: {
    tenantId: string
    actorId: string
    resourceKey: string
    name: string
    isDefault: boolean
    stateJson: unknown
  }): Promise<SavedView> {
    return this.savedViewRepo.create(input as Omit<SavedView, 'id' | 'createdAt' | 'updatedAt'>)
  }

  async update(
    id: string,
    tenantId: string,
    actorId: string,
    data: { name?: string; stateJson?: unknown },
  ): Promise<SavedView> {
    return this.savedViewRepo.update(
      id,
      tenantId,
      actorId,
      data as Partial<Pick<SavedView, 'name' | 'stateJson'>>,
    )
  }

  async delete(id: string, tenantId: string, actorId: string): Promise<void> {
    return this.savedViewRepo.delete(id, tenantId, actorId)
  }

  async setDefault(
    id: string,
    tenantId: string,
    actorId: string,
    resourceKey: string,
  ): Promise<void> {
    return this.savedViewRepo.setDefault(id, tenantId, actorId, resourceKey)
  }
}
