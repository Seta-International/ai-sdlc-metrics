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
}
