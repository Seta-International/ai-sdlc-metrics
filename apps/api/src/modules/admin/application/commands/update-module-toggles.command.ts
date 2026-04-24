export interface ModuleToggleInput {
  moduleKey: string
  enabled: boolean
}

export class UpdateModuleTogglesCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    readonly toggles: ModuleToggleInput[],
  ) {}
}
