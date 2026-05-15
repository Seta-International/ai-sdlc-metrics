export type RunStatus = 'idle' | 'running' | 'completed' | 'failed' | 'aborted'

export interface AgentClientOptions {
  /** Absolute origin of apps/api, e.g. https://api.os.seta-international.com */
  baseUrl: string
  /** Cookie credential mode — defaults to 'include' for cross-origin session cookies */
  credentials?: RequestCredentials
  /** Extra headers merged into every request */
  headers?: Record<string, string>
  /** Override fetch (testing) */
  fetch?: typeof fetch
}

export interface RequestOptions {
  signal?: AbortSignal
  headers?: Record<string, string>
  /** JSON body — stringified automatically */
  body?: unknown
}
