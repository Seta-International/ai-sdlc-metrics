import type {
  AgentWriteDedupRow,
  NewAgentWriteDedupRow,
} from '../../infrastructure/schema/agents.schema'

export const WRITE_DEDUP_REPOSITORY = Symbol('WRITE_DEDUP_REPOSITORY')

export interface IWriteDedupRepository {
  findByKey(idempotencyKey: string): Promise<AgentWriteDedupRow | null>
  insert(row: NewAgentWriteDedupRow): Promise<void>
  deleteExpired(): Promise<{ deletedCount: number }>
}
