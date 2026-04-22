import type {
  SemanticIndexRepository,
  SemanticIndexResult,
} from '../../domain/repositories/semantic-index.repository'

/**
 * No-op semantic index — default wiring at MVP (activation gate: opt-in per sub-agent,
 * no day-1 modules declare toolScope inclusion).
 *
 * Replace with DrizzleSemanticIndexRepository when pgvector extension is
 * provisioned and a sub-agent opts in via toolScope.
 */
export class NullSemanticIndexRepository implements SemanticIndexRepository {
  async index(): Promise<void> {
    return undefined
  }

  async search(): Promise<ReadonlyArray<SemanticIndexResult>> {
    return []
  }

  async purgeForUser(): Promise<{ count: number }> {
    return { count: 0 }
  }
}
