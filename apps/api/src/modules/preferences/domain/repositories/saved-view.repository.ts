import type { ResolveResult, SavedView } from '../entities/saved-view.entity'

export const SAVED_VIEW_REPOSITORY = Symbol('ISavedViewRepository')

export interface ISavedViewRepository {
  listByResource(tenantId: string, actorId: string, resourceKey: string): Promise<SavedView[]>
  findById(id: string, tenantId: string, actorId: string): Promise<SavedView | null>
  resolve(
    tenantId: string,
    actorId: string,
    resourceKey: string,
    activeViewId: string | null,
  ): Promise<ResolveResult>
  create(data: Omit<SavedView, 'id' | 'createdAt' | 'updatedAt'>): Promise<SavedView>
  update(
    id: string,
    tenantId: string,
    actorId: string,
    data: Partial<Pick<SavedView, 'name' | 'stateJson'>>,
  ): Promise<SavedView>
  delete(id: string, tenantId: string, actorId: string): Promise<void>
  setDefault(id: string, tenantId: string, actorId: string, resourceKey: string): Promise<void>
}
