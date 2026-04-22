/**
 * WhenToUseCollisionLinter — authoring-time lint for whenToUse descriptor collisions
 * (Plan 02.5 §4, R-02.5.9).
 *
 * Computes pairwise cosine similarity between tool descriptor embeddings within a
 * given toolScope. Returns pairs whose similarity meets or exceeds the configured
 * threshold — these pairs have near-duplicate whenToUse semantics, which makes the
 * retriever's ranking ambiguous between them.
 *
 * Consumed by:
 *   - Plan 02 aggregator boot (boot-time lint warning on boot log)
 *   - Plan 10 CI harness (PR hard-fail after threshold tuning completes)
 *
 * Tools with no embedding in the in-memory index are silently skipped —
 * this happens when ensureEmbedded has not yet run for a given descriptor.
 * Callers should invoke ensureEmbedded before linting to guarantee coverage.
 */

import { Inject, Injectable } from '@nestjs/common'
import type { AgentToolDescriptor } from '../../../../common/trpc/agent-tool-meta'
import { TOOL_DESCRIPTOR_EMBEDDER } from '../../infrastructure/retrieval/tool-descriptor-embedder'
import { cosineSimilarity } from '../../infrastructure/retrieval/cosine'

// ─── Constants ─────────────────────────────────────────────────────────────────

/**
 * Default similarity threshold for collision detection.
 *
 * Open question (plan 02.5 §18): the exact value is pending empirical tuning
 * against the seeded collision pairs in the 12-sub-agent EI-5 fixture. 0.92 is
 * the seed value from internal tool-search research; the Beta reviewer finalises
 * this before enabling the lint gate in plan 10 CI.
 */
export const DEFAULT_COLLISION_THRESHOLD = 0.92

// ─── Embedder interface (structural) ───────────────────────────────────────────

/**
 * Minimal structural interface consumed by the linter.
 * Using a structural type (not the concrete class) avoids a circular DI dependency
 * and makes the linter trivially testable with a plain object mock.
 */
export interface EmbeddingIndex {
  getEmbedding(toolName: string): number[] | undefined
}

// ─── CollisionPair ─────────────────────────────────────────────────────────────

export interface CollisionPair {
  readonly toolA: string
  readonly toolB: string
  readonly similarity: number
}

// ─── WhenToUseCollisionLinter ─────────────────────────────────────────────────

export const WHEN_TO_USE_COLLISION_LINTER = Symbol('WHEN_TO_USE_COLLISION_LINTER')

@Injectable()
export class WhenToUseCollisionLinter {
  constructor(
    @Inject(TOOL_DESCRIPTOR_EMBEDDER)
    private readonly embedder: EmbeddingIndex,
  ) {}

  /**
   * Lint a set of tool descriptors for whenToUse semantic collisions.
   *
   * Iterates all unique (i, j) pairs where i < j, computes cosine similarity
   * between the two tools' embeddings, and returns pairs meeting or exceeding
   * the threshold. Either tool lacking an embedding is silently skipped.
   *
   * @param toolScope  - Descriptors to lint (order-independent).
   * @param threshold  - Similarity ≥ threshold is a collision. Defaults to
   *                     DEFAULT_COLLISION_THRESHOLD.
   * @returns Unique (A, B) collision pairs, A declared before B in toolScope.
   */
  lint(
    toolScope: ReadonlyArray<AgentToolDescriptor>,
    threshold: number = DEFAULT_COLLISION_THRESHOLD,
  ): ReadonlyArray<CollisionPair> {
    const collisions: CollisionPair[] = []

    for (let i = 0; i < toolScope.length; i++) {
      for (let j = i + 1; j < toolScope.length; j++) {
        const nameA = toolScope[i]!.name
        const nameB = toolScope[j]!.name

        const vecA = this.embedder.getEmbedding(nameA)
        const vecB = this.embedder.getEmbedding(nameB)

        if (vecA === undefined || vecB === undefined) continue

        const similarity = cosineSimilarity(vecA, vecB)
        if (similarity >= threshold) {
          collisions.push({ toolA: nameA, toolB: nameB, similarity })
        }
      }
    }

    return collisions
  }
}
