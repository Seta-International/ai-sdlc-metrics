import type { RagApi, RagHit } from './types.js'

export interface FakeRagOptions {
  /** Canned hits returned by `retrieve` regardless of query. */
  hits?: RagHit[]
  /** Optional dynamic responder; takes precedence over `hits` when set. */
  retrieve?: (query: string) => RagHit[] | Promise<RagHit[]>
}

/**
 * Stub implementation. Plan C replaces this with the real fake.
 */
export function createFakeAgentRag(
  _opts?: FakeRagOptions,
): RagApi & { __calls: { ingest: Array<{ sourceId: string; content: string }> } } {
  return {
    __calls: { ingest: [] },
    async ingest(): Promise<void> {
      throw new Error('createFakeAgentRag: not implemented yet (see Plan C)')
    },
    async retrieve() {
      throw new Error('createFakeAgentRag: not implemented yet (see Plan C)')
    },
  }
}
