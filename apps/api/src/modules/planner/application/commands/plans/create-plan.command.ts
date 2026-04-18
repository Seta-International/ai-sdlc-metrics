import type { PlanContainer } from '../../../domain/value-objects/plan-container.vo'

export class CreatePlanCommand {
  constructor(
    public readonly tenantId: string,
    public readonly id: string,
    public readonly name: string,
    public readonly description: string | null,
    public readonly container: PlanContainer,
    public readonly createdBy: string,
    public readonly bucketId: string,
  ) {}
}
