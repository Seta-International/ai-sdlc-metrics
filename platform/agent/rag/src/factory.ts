import type { RagApi, RagDeps } from './types.js'

/**
 * Stub implementation. Plans D + E replace this with the real
 * ingest/retrieve closures.
 */
export function createAgentRag(_deps: RagDeps): RagApi {
  return {
    async ingest(): Promise<void> {
      throw new Error('createAgentRag.ingest: not implemented yet (see Plan D)')
    },
    async retrieve() {
      throw new Error('createAgentRag.retrieve: not implemented yet (see Plan E)')
    },
  }
}
