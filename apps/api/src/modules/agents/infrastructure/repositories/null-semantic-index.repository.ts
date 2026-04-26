import type {
  SemanticIndexRepository,
  SemanticIndexResult,
} from '../../domain/repositories/semantic-index.repository'

/**
 * No-op semantic index — kept for test mocking and as a safe fallback if the
 * DB binding is swapped out in tests. Production wiring uses
 * DrizzleSemanticIndexRepository (agents.module.ts).
 *
 * Note: purgeForUser always returns count 0 — this stub must NEVER be wired
 * in production because it makes the GDPR erasure pipeline silently incomplete.
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
