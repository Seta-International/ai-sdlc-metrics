import { createIngest } from './ingest.js'
import type { RagApi, RagDeps } from './types.js'

/**
 * Build a `RagApi` instance from injected dependencies.
 *
 * Composition root (e.g. `apps/api/src/main.ts`) creates this once at
 * boot and binds it to the FAQ Agent's tool registry.
 *
 * - `ingest` is fully implemented here (see `ingest.ts`).
 * - `retrieve` is implemented in Plan E.
 */
export function createAgentRag(deps: RagDeps): RagApi {
  const ingest = createIngest({ sql: deps.sql, embeddings: deps.embeddings })

  return {
    ingest,
    async retrieve() {
      throw new Error('createAgentRag.retrieve: not implemented yet (see Plan E)')
    },
  }
}
