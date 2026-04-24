import { Injectable } from '@nestjs/common'
import { KernelDelegationFacade } from '../../../kernel/application/facades/kernel-delegation.facade'

@Injectable()
export class ApprovalExecutorDelegationMinter {
  constructor(private readonly kernelDelegationFacade: KernelDelegationFacade) {}

  async mintForDraft(opts: {
    draftId: string
    tenantId: string
    initiatorUserId: string
    toolName: string
    expiresAt: Date
  }): Promise<{ delegationId: string }> {
    const { id } = await this.kernelDelegationFacade.createDelegation({
      tenantId: opts.tenantId,
      delegatorUserId: opts.initiatorUserId,
      delegate: 'agent:approval-executor',
      scope: { draftId: opts.draftId, toolName: opts.toolName },
      expiresAt: opts.expiresAt,
    })

    return { delegationId: id }
  }
}
