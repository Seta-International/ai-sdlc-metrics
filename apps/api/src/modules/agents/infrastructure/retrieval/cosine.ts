/**
 * Cosine similarity helper for tool retrieval (Plan 02.5 Task 2).
 *
 * Pure function — no dependencies beyond math.
 * Returns a value in [-1, 1].
 * Returns 0 if either vector is zero-length, lengths differ, or either is a zero vector.
 */

/**
 * Compute the cosine similarity between two vectors.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Similarity in [-1, 1], or 0 for degenerate inputs.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0
  }

  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!
    const bi = b[i]!
    if (!isFinite(ai) || !isFinite(bi)) return 0
    dot += ai * bi
    normA += ai * ai
    normB += bi * bi
  }

  if (normA === 0 || normB === 0) {
    return 0
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}
