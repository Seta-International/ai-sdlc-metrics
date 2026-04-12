import type { SavedViewState } from '../../domain/entities/saved-view.entity'

export class UpdateSavedViewCommand {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly name?: string,
    public readonly stateJson?: SavedViewState,
  ) {}
}
