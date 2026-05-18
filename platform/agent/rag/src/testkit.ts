// platform/agent/rag/src/testkit.ts
import type { RagApi, RagHit } from './types.js'

export interface FakeRagOptions {
  /** Canned hits returned by `retrieve` regardless of query. */
  hits?: RagHit[]
  /** Optional dynamic responder; takes precedence over `hits` when set. */
  retrieve?: (query: string) => RagHit[] | Promise<RagHit[]>
}

export interface FakeAgentRag extends RagApi {
  __calls: { ingest: Array<{ sourceId: string; content: string }> }
}

/**
 * In-memory `RagApi` for tests. Matches `RagApi` exactly so consumers
 * (e.g. the FAQ Agent) can bind to the fake and swap to the real
 * `createAgentRag` in production with a one-line change.
 *
 * - `retrieve` returns the `retrieve` responder's value when set,
 *   otherwise `hits ?? []`. The responder may be sync or async.
 * - `ingest` is a no-op that pushes `{ sourceId, content }` onto
 *   `__calls.ingest` for assertions.
 *
 * Each invocation produces a fresh instance with its own `__calls` array.
 */
export function createFakeAgentRag(opts: FakeRagOptions = {}): FakeAgentRag {
  const __calls: FakeAgentRag['__calls'] = { ingest: [] }

  return {
    __calls,
    async ingest(sourceId, content): Promise<void> {
      __calls.ingest.push({ sourceId, content })
    },
    async retrieve(query) {
      if (opts.retrieve !== undefined) {
        return Promise.resolve(opts.retrieve(query))
      }
      return opts.hits ?? []
    },
  }
}
