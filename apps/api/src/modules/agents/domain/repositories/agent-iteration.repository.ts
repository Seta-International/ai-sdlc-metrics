import type {
  AgentIterationRow,
  NewAgentIterationRow,
} from '../../infrastructure/schema/agent-iteration.schema'

export interface AgentIterationRepository {
  save(row: NewAgentIterationRow): Promise<AgentIterationRow>
  findByTurnId(turnId: string): Promise<AgentIterationRow[]>
}

export const AGENT_ITERATION_REPOSITORY = Symbol('AGENT_ITERATION_REPOSITORY')
