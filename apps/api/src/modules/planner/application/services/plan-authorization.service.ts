import { Injectable, Inject } from '@nestjs/common'
import { PERMISSIONS } from '../../../../common/auth/permissions'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../domain/repositories/plan.repository'
import { UnauthorizedPlanAccessException } from '../../domain/exceptions/unauthorized-plan-access.exception'
import type { Plan } from '../../domain/entities/plan.entity'

@Injectable()
export class PlanAuthorizationService {
  constructor(
    private readonly kernelQueryFacade: KernelQueryFacade,
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
  ) {}

  async assertCanCreatePlan(actorId: string, tenantId: string): Promise<void> {
    const allowed = await this.kernelQueryFacade.canDo(actorId, PERMISSIONS.PLANNER_PLAN_CREATE, {
      tenantId,
    })
    if (!allowed) {
      throw new UnauthorizedPlanAccessException(actorId, 'plan')
    }
  }

  async assertCanReadPlan(actorId: string, planId: string, tenantId: string): Promise<void> {
    const plan = await this.planRepo.findById(planId, tenantId)
    if (!plan) {
      throw new UnauthorizedPlanAccessException(actorId, planId)
    }
    if (this.isMember(plan, actorId)) {
      return
    }
    const allowed = await this.kernelQueryFacade.canDo(actorId, PERMISSIONS.PLANNER_PLAN_READ_ANY, {
      tenantId,
    })
    if (!allowed) {
      throw new UnauthorizedPlanAccessException(actorId, planId)
    }
  }

  async assertCanEditPlan(actorId: string, planId: string, tenantId: string): Promise<void> {
    const plan = await this.planRepo.findById(planId, tenantId)
    if (!plan) {
      throw new UnauthorizedPlanAccessException(actorId, planId)
    }
    if (!this.hasMemberRole(plan, actorId, ['owner', 'editor'])) {
      throw new UnauthorizedPlanAccessException(actorId, planId)
    }
  }

  async assertCanAdminPlan(actorId: string, planId: string, tenantId: string): Promise<void> {
    const plan = await this.planRepo.findById(planId, tenantId)
    if (!plan) {
      throw new UnauthorizedPlanAccessException(actorId, planId)
    }
    if (!this.hasMemberRole(plan, actorId, ['owner'])) {
      throw new UnauthorizedPlanAccessException(actorId, planId)
    }
  }

  async assertCanManageMembers(actorId: string, planId: string, tenantId: string): Promise<void> {
    const plan = await this.planRepo.findById(planId, tenantId)
    if (!plan) {
      throw new UnauthorizedPlanAccessException(actorId, planId)
    }
    if (this.hasMemberRole(plan, actorId, ['owner'])) {
      return
    }
    const allowed = await this.kernelQueryFacade.canDo(
      actorId,
      PERMISSIONS.PLANNER_PLAN_MANAGE_MEMBERS_ANY,
      { tenantId },
    )
    if (!allowed) {
      throw new UnauthorizedPlanAccessException(actorId, planId)
    }
  }

  /**
   * A viewer who is assigned to the task may update their own progress.
   * Editors and owners always pass. Non-member viewers are rejected.
   */
  async assertCanUpdateOwnTaskProgress(
    actorId: string,
    planId: string,
    tenantId: string,
    taskAssigneeIds: readonly string[],
  ): Promise<void> {
    const plan = await this.planRepo.findById(planId, tenantId)
    if (!plan) {
      throw new UnauthorizedPlanAccessException(actorId, planId)
    }
    if (this.hasMemberRole(plan, actorId, ['owner', 'editor'])) {
      return
    }
    // Viewer path: must be assigned to the task
    if (this.hasMemberRole(plan, actorId, ['viewer']) && taskAssigneeIds.includes(actorId)) {
      return
    }
    throw new UnauthorizedPlanAccessException(actorId, planId)
  }

  /**
   * Owner members or editors can delete a task.
   */
  async assertCanDeleteTask(actorId: string, planId: string, tenantId: string): Promise<void> {
    return this.assertCanEditPlan(actorId, planId, tenantId)
  }

  /**
   * Any plan member (owner, editor, or viewer) can perform this action.
   * Used for toggle checklist — spec allows all members to toggle.
   */
  async assertIsPlanMember(actorId: string, planId: string, tenantId: string): Promise<void> {
    const plan = await this.planRepo.findById(planId, tenantId)
    if (!plan) {
      throw new UnauthorizedPlanAccessException(actorId, planId)
    }
    if (!this.isMember(plan, actorId)) {
      throw new UnauthorizedPlanAccessException(actorId, planId)
    }
  }

  private isMember(plan: Plan, actorId: string): boolean {
    return plan.members.some((m) => m.actorId === actorId)
  }

  private hasMemberRole(
    plan: Plan,
    actorId: string,
    roles: Array<'owner' | 'editor' | 'viewer'>,
  ): boolean {
    return plan.members.some((m) => m.actorId === actorId && roles.includes(m.role))
  }
}
