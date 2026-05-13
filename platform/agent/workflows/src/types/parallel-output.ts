import type { Step } from './step'

// `any` (not `unknown`) is required here so callers can pass
// `ReadonlyArray<Step<TCurrent, unknown, string>>` for a specific TCurrent —
// Step is invariant in TIn (inputSchema is a ZodType<TIn>), so unknown would
// reject narrower TCurrent values.
// biome-ignore lint/suspicious/noExplicitAny: variance helper
export type ParallelOutput<S extends ReadonlyArray<Step<any, any, string>>> = {
  // biome-ignore lint/suspicious/noExplicitAny: infer position
  [K in S[number] as K extends Step<any, any, infer Id> ? Id : never]: K extends Step<
    // biome-ignore lint/suspicious/noExplicitAny: infer position
    any,
    infer Out,
    string
  >
    ? Out
    : never
}
