import { Injectable, Inject } from '@nestjs/common'
import { PERMISSIONS } from '../../../../common/auth/permissions'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../domain/repositories/plan.repository'
import { TASK_REPOSITORY, type ITaskRepository } from '../../domain/repositories/task.repository'
import { UnauthorizedPlanAccessException } from '../../domain/exceptions/unauthorized-plan-access.exception'
import type { Plan } from '../../domain/entities/plan.entity'

@Injectable()
export class PlanAuthorizationService {
  constructor(
    private readonly kernelQueryFacade: KernelQueryFacade,
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
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

  async assertCanEditTask(actorId: string, taskId: string, tenantId: string): Promise<void> {
    const task = await this.taskRepo.findById(taskId, tenantId)
    if (!task) {
      throw new UnauthorizedPlanAccessException(actorId, taskId)
    }
    const plan = await this.planRepo.findById(task.planId, tenantId)
    if (!plan) {
      throw new UnauthorizedPlanAccessException(actorId, taskId)
    }
    if (!this.hasMemberRole(plan, actorId, ['owner', 'editor'])) {
      throw new UnauthorizedPlanAccessException(actorId, taskId)
    }
  }

  async assertCanUpdateOwnTaskProgress(
    actorId: string,
    taskId: string,
    tenantId: string,
  ): Promise<void> {
    const task = await this.taskRepo.findById(taskId, tenantId)
    if (!task) {
      throw new UnauthorizedPlanAccessException(actorId, taskId)
    }
    const plan = await this.planRepo.findById(task.planId, tenantId)
    if (!plan) {
      throw new UnauthorizedPlanAccessException(actorId, taskId)
    }
    if (!this.isMember(plan, actorId)) {
      throw new UnauthorizedPlanAccessException(actorId, taskId)
    }
  }

  async assertCanCommentOnTask(actorId: string, taskId: string, tenantId: string): Promise<void> {
    const task = await this.taskRepo.findById(taskId, tenantId)
    if (!task) {
      throw new UnauthorizedPlanAccessException(actorId, taskId)
    }
    const plan = await this.planRepo.findById(task.planId, tenantId)
    if (!plan) {
      throw new UnauthorizedPlanAccessException(actorId, taskId)
    }
    if (!this.isMember(plan, actorId)) {
      throw new UnauthorizedPlanAccessException(actorId, taskId)
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
