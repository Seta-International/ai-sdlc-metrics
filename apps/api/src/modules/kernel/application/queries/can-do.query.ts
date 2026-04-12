export interface CanDoContext {
  tenantId: string
  scopeType?: 'global' | 'department' | 'project' | 'account'
  scopeId?: string
  resourceOwnerId?: string
}

export class CanDoQuery {
  constructor(
    readonly actorId: string,
    readonly permission: string,
    readonly context: CanDoContext,
  ) {}
}
