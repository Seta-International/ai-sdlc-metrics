import type { SavedViewState } from '../../domain/entities/saved-view.entity'

export class CreateSavedViewCommand {
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly resourceKey: string,
    public readonly name: string,
    public readonly isDefault: boolean,
    public readonly stateJson: SavedViewState,
  ) {}
}
