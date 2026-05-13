import type { Step } from './step'

export type ParallelOutput<S extends ReadonlyArray<Step<unknown, unknown, string>>> = {
  [K in S[number] as K extends Step<unknown, unknown, infer Id> ? Id : never]: K extends Step<
    unknown,
    infer Out,
    string
  >
    ? Out
    : never
}
