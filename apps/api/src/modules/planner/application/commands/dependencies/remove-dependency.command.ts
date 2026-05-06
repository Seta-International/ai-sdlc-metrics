import type { DependencyKind } from '../../../domain/repositories/task-dependency.repository'

export class RemoveDependencyCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly actorId: string,
    public readonly fromTaskId: string,
    public readonly toTaskId: string,
    public readonly kind: DependencyKind,
  ) {}
}
