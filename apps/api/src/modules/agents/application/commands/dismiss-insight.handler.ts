import { Inject, Injectable } from '@nestjs/common'
import {
  AGENT_INSIGHT_REPOSITORY,
  type AgentInsightRepository,
} from '../../domain/repositories/agent-insight.repository'
import type { DismissInsightCommand } from './dismiss-insight.command'

@Injectable()
export class DismissInsightHandler {
  constructor(
    @Inject(AGENT_INSIGHT_REPOSITORY)
    private readonly insightRepo: AgentInsightRepository,
  ) {}

  async execute(command: DismissInsightCommand): Promise<void> {
    await this.insightRepo.dismiss(command.insightId, command.tenantId)
  }
}
