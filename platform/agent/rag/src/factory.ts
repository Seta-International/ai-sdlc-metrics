import { createIngest } from './ingest.js'
import { createRetrieve } from './retrieve.js'
import type { RagApi, RagDeps } from './types.js'

/**
 * Build a `RagApi` instance from injected dependencies.
 *
 * Composition root (e.g. `apps/api/src/main.ts`) creates this once at
 * boot and binds it to the FAQ Agent's tool registry.
 */
export function createAgentRag(deps: RagDeps): RagApi {
  return {
    ingest: createIngest({ sql: deps.sql, embeddings: deps.embeddings }),
    retrieve: createRetrieve({ sql: deps.sql, embeddings: deps.embeddings }),
  }
}
